'use strict';

const express      = require('express');
const path         = require('path');
const session      = require('express-session');
const MongoStore   = require('connect-mongodb-session')(session);
const exphbs       = require('express-handlebars');
const { connectDB, getDB } = require('./config/db');
const inventoryUrl = require('./lib/inventory-url');
const common       = require('./lib/common');
const moment       = require('moment-timezone');

const app = express();

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
app.config = {
    siteName:        'Boats App',
    productsPerPage: 12,
    baseUrl:         process.env.BASE_URL || 'http://localhost:3000',
    themeViews:      'themes/material/',
    company_name:    'Idaho Water Sports',
};

// ---------------------------------------------------------------------------
// Handlebars engine — all helpers copied from mean-idaho-master/app.js
// ---------------------------------------------------------------------------
const hbs = exphbs.create({
    extname:       '.hbs',
    defaultLayout: 'main',
    layoutsDir:    path.join(__dirname, 'views', 'layouts'),
    partialsDir:   path.join(__dirname, 'views', 'partials'),
    helpers: {

        // {{#ifCond v1 '==' v2}} — used extensively in boats.hbs
        ifCond: function(v1, operator, v2, options) {
            switch (operator) {
                case '==':  return (v1 == v2)  ? options.fn(this) : options.inverse(this);
                case '===': return (v1 === v2) ? options.fn(this) : options.inverse(this);
                case '!=':  return (v1 != v2)  ? options.fn(this) : options.inverse(this);
                case '!==': return (v1 !== v2) ? options.fn(this) : options.inverse(this);
                case '<':   return (v1 <  v2)  ? options.fn(this) : options.inverse(this);
                case '<=':  return (v1 <= v2)  ? options.fn(this) : options.inverse(this);
                case '>':   return (v1 >  v2)  ? options.fn(this) : options.inverse(this);
                case '>=':  return (v1 >= v2)  ? options.fn(this) : options.inverse(this);
                default:    return options.inverse(this);
            }
        },

        // {{lookup obj key}} — for {{lookup ../session this.hiddenId}} in filter panels
        lookup: function(obj, key) {
            return obj && obj[key];
        },

        // {{imgAlt 'key' 'Fallback text'}} — alt text stub
        imgAlt: function(key, fallback) {
            return fallback || key;
        },

        // {{thousandSeprator 49999}} → "49,999"  (copied from reference app.js line 332)
        thousandSeprator: function(stringVal) {
            stringVal = parseFloat(stringVal);
            return stringVal.toLocaleString();
        },

        // {{CalculatePaymentFromBoatPrice price}} → monthly EMI string
        // Copied exactly from mean-idaho-master/app.js line 218
        CalculatePaymentFromBoatPrice: function(boat_price) {
            if (!boat_price || isNaN(parseFloat(boat_price))) return '0';
            const raw         = parseFloat(boat_price.toString().replace(/[$,]/g, ''));
            const principal   = raw * 0.80;       // 20% down
            const monthlyRate = 7.99 / 1200;
            const n           = 240;              // 20 years × 12
            const emi = (principal * monthlyRate * Math.pow(1 + monthlyRate, n)) /
                        (Math.pow(1 + monthlyRate, n) - 1);
            const val = Math.round(emi * 10) / 10;
            return val > 0
                ? val.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 2 })
                : '0';
        },

        // {{purchasePrice boat_msrp boat_price}} → formatted price
        // Copied from mean-idaho-master/app.js line 197
        purchasePrice: function(boat_msrp, boat_price) {
            let thou = (stringVal) => {
                stringVal = parseFloat(stringVal);
                return stringVal.toLocaleString();
            };

            if (boat_price != "") {
                return '$' + thou(boat_price);
            }
        },

        // {{purchasePrice25Percent boat_msrp boat_price}} → 20% down payment
        // Copied from mean-idaho-master/app.js line 208
        purchasePrice25Percent: function(boat_msrp, boat_price) {
            let getRawPrice = (price) => parseFloat(price.toString().replace(/,/g, '').replace('$', ''));

            if (boat_price != "") {
                let rawPrice = getRawPrice(boat_price);
                let twentyFivePercent = rawPrice * 0.20;
                return '$' + twentyFivePercent.toLocaleString(undefined, { minimumFractionDigits: 2 });
            }
        },

        // {{{priceLogic boat_msrp boat_price}}} → HTML for price display
        // Copied from mean-idaho-master/app.js line 164
        priceLogic: function(boat_msrp, boat_price) {
            let thou = (stringVal) => {
                stringVal = parseFloat(stringVal);
                return stringVal.toLocaleString();
            };

            let html = "";
            const hasMsrp =
                boat_msrp !== undefined &&
                boat_msrp !== null &&
                boat_msrp !== "" &&
                !Number.isNaN(boat_msrp);

            const hasPrice =
                boat_price !== undefined &&
                boat_price !== null &&
                boat_price !== "" &&
                !Number.isNaN(boat_price);

            if (hasMsrp && hasPrice) {
                html += '<h4 class="original-price">Retail Price:<span class="original-price" style="float:right;text-decoration: line-through;">$' + thou(boat_msrp) + '</span></h4>';
                html += '<h3><span class="sale-price">Sale Price:</span><span class="sale-price" style="float:right;">$' + thou(boat_price) + '</span></h3>';
            } else if (hasMsrp && !hasPrice) {
                html += '<h4 class="original-price">Retail Price:<span class="original-price" style="float:right;text-decoration: line-through;">$' + thou(boat_msrp) + '</span></h4>';
                html += '<h3><span class="sale-price">Sale Price:</span><span style="float:right;">Request Pricing</span></h3>';
            } else if (!hasMsrp && hasPrice) {
                html += '<h3><span class="sale-price">Sale Price:</span><span class="sale-price" style="float:right;">$' + thou(boat_price) + '</span></h3>';
            } else {
                html += '<h3><span class="sale-price">Sale Price:</span><span class="sale-price" style="float:right;">Request Pricing</span></h3>';
            }
            return html;
        },

        // {{calculateSavings boat_msrp boat_price}} → savings amount
        // Copied from mean-idaho-master/app.js line 240
        calculateSavings: function(boat_msrp, boat_price) {
            let thou = (stringVal) => {
                stringVal = parseFloat(stringVal);
                return stringVal.toLocaleString();
            };

            const msrp = parseFloat(boat_msrp);
            const price = parseFloat(boat_price);

            if (!isNaN(msrp) && !isNaN(price) && msrp > price) {
                return '$' + thou(msrp - price);
            } else {
                return null;
            }
        },

        // {{ytThumb url}} → YouTube thumbnail URL
        // Copied from mean-idaho-master/app.js line 1004
        ytThumb: function(url) {
            if (!url) return '';
            var videoId = '';
            try {
                var parsed = new URL(url);
                if (parsed.hostname === 'youtu.be') {
                    videoId = parsed.pathname.slice(1);
                } else if (parsed.hostname.includes('youtube.com')) {
                    videoId = parsed.searchParams.get('v') || '';
                }
            } catch(e) {}
            return videoId ? 'https://img.youtube.com/vi/' + videoId + '/hqdefault.jpg' : '';
        },

        // {{indexInc index}} → index + 1
        // Copied from mean-idaho-master/app.js line 281
        indexInc: function(index) {
            return index + 1;
        },

        // {{isNull value options}} — conditional check for null/undefined
        // Copied from mean-idaho-master/app.js line 358
        isNull: function(value, options) {
            if (typeof value === 'undefined' || value === '') {
                return options.fn(this);
            }
            return options.inverse(this);
        },

        // {{toLower value}} — convert to lowercase
        // Copied from mean-idaho-master/app.js line 364
        toLower: function(value) {
            if (value) {
                return value.toLowerCase();
            }
            return null;
        },

        // {{increment num}} — increment number
        // Copied from mean-idaho-master/app.js line 451
        increment: function(num1) {
            var num = parseInt(num1);
            return num + 1;
        },

        // {{decrement num}} — decrement number
        // Copied from mean-idaho-master/app.js line 441
        decrement: function(num1) {
            return num1 - 1;
        },

        // {{objectLength obj}} — get object length
        // Copied from mean-idaho-master/app.js line 336
        objectLength: function(obj) {
            if (obj) {
                return Object.keys(obj).length;
            }
            return 0;
        },

        // {{stringify obj}} — JSON stringify
        // Copied from mean-idaho-master/app.js line 465
        stringify: function(value) {
            return JSON.stringify(value);
        },

        // {{split string delimiter index}} — split string and get element
        // Copied from mean-idaho-master/app.js line 538
        split: function(stringVal, delimiter, index) {
            if (typeof stringVal !== 'string') {
                return '';
            }
            const parts = stringVal.split(delimiter);
            index = parseInt(index);
            return parts[index] || '';
        },

        // {{checkedState state}} — return 'checked' if true
        // Copied from mean-idaho-master/app.js line 342
        checkedState: function(state) {
            if (state === 'true' || state === true) {
                return 'checked';
            }
            return '';
        },

        // {{selectState state value}} — return 'selected' if matches
        // Copied from mean-idaho-master/app.js line 348
        selectState: function(state, value) {
            if (state === value) {
                return 'selected';
            }
            return '';
        },

        // {{formatDate date format}} — format date with moment
        // Copied from mean-idaho-master/app.js line 383
        // Note: moment not installed, returns string for now
        formatDate: function(date, format) {
            if (!date) return '';
            return new Date(date).toISOString().split('T')[0]; // Simple fallback
        },

        // {{ifInArray value array options}} — check if value in array
        // Copied from mean-idaho-master/app.js line 386
        ifInArray: function(value, array, options) {
            if (Array.isArray(array) && array.some(a => String(a) === String(value))) {
                return options.fn(this);
            }
            return options.inverse(this);
        },

        // {{json context}} — JSON stringify with SafeString
        // Copied from mean-idaho-master/app.js line 430
        json: function(context) {
            const Handlebars = require('handlebars');
            return new Handlebars.SafeString(JSON.stringify(context));
        },

        // {{times n block}} — repeat block n times
        // Copied from mean-idaho-master/app.js line 433
        times: function(n, block) {
            var accum = '';
            for (var i = 0; i < n; i++) {
                accum += block.fn(parseInt(i + 1));
            }
            return accum;
        },

        // {{assign varName varValue options}} — assign variable to context
        // Copied from mean-idaho-master/app.js line 471
        assign: function(varName, varValue, options) {
            if (!options.data.root) {
                options.data.root = {};
            }
            options.data.root[varName] = varValue;
        },

        // {{resizeUrl url params}} — CDN image resize helper
        // Copied from mean-idaho-master/app.js line 26
        resizeUrl: function(url, params) {
            try {
                const CDN_BASE = 'https://cdn.mdsbrand.com/';
                if (!url || typeof url !== 'string') return url || '';
                if (!url.startsWith(CDN_BASE) || url.includes('?')) return url;
                let rest = decodeURIComponent(url.slice(CDN_BASE.length));
                if (!/^[A-Za-z0-9._~!$'()*+,;=@/-]+$/.test(rest)) return url;
                return `${CDN_BASE}resize/${rest}${params ? `?${params}` : ''}`;
            } catch (e) {
                return url || '';
            }
        },

        // {{resizeCallerIqUrl url params}} — CallerIQ CDN resize helper
        // Copied from mean-idaho-master/app.js line 39
        resizeCallerIqUrl: function(url, params) {
            try {
                const CALLERSIQ_CDN_BASE = 'https://cdn.callersiq.com/';
                if (!url || typeof url !== 'string') return url || '';
                if (!url.startsWith(CALLERSIQ_CDN_BASE) || url.includes('?')) return url;
                let rest = decodeURIComponent(url.slice(CALLERSIQ_CDN_BASE.length));
                if (!/^[A-Za-z0-9._~!$'()*+,;=@/-]+$/.test(rest)) return url;
                return `${CALLERSIQ_CDN_BASE}resize/${rest}${params ? `?${params}` : ''}`;
            } catch (e) {
                return url || '';
            }
        },

        // {{utmValue session key}} — get UTM parameter from session
        // Copied from mean-idaho-master/app.js line 503
        utmValue: function(session, key) {
            try {
                if (!session || !session.utm) return "";
                return session.utm[key] || "";
            } catch (e) {
                return "";
            }
        },

        // {{utmQueryString session}} — build a UTM query string from session
        // Returns "?utm_source=X&utm_medium=Y&..." if any UTM values exist,
        // or an empty string if none are present.
        utmQueryString: function(session) {
            try {
                if (!session || !session.utm) return "";
                const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];
                const parts = [];
                UTM_KEYS.forEach(function(key) {
                    const val = session.utm[key];
                    if (val) parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(val));
                });
                return parts.length ? '?' + parts.join('&') : '';
            } catch (e) {
                return "";
            }
        },

        // {{getDateRange events}} — format event date range
        // Copied from reference project
        getDateRange: function(events) {
            if (!events || !Array.isArray(events) || events.length === 0) {
                return '';
            }
            const firstEvent = events[0];
            if (firstEvent.eventDate) {
                return moment(firstEvent.eventDate).format('MMMM D, YYYY');
            }
            return '';
        },

        // {{formatToMonthDayYear date}} — format date to Month Day, Year
        // Copied from reference project
        formatToMonthDayYear: function(date) {
            if (!date) return '';
            return moment(date).format('MMMM D, YYYY');
        },
    },
});




app.engine('.hbs', hbs.engine);
app.set('view engine', '.hbs');
app.set('views', path.join(__dirname, 'views'));

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/css', express.static(path.join(__dirname, 'css')));

// ---------------------------------------------------------------------------
// Session — MUST be registered BEFORE routes
// ---------------------------------------------------------------------------
const store = new MongoStore({
    uri:          'mongodb://127.0.0.1:27017',
    collection:   'sessions',
    databaseName: 'filtering-system',
});
store.on('error', (err) => console.error('Session store error:', err));

app.use(session({
    secret:            'filter-secret-key',
    resave:            false,
    saveUninitialized: true,
    store:             store,
    cookie:            { maxAge: 1000 * 60 * 60 * 24 },
}));

// Make handlebars helpers accessible to routes
app.use((req, res, next) => {
    req.handlebars = hbs;
    next();
});

// ---------------------------------------------------------------------------
// Bypass login — fake a logged-in admin for ALL requests
// Must be before any route mounts so restrict/checkAccess always passes
// ---------------------------------------------------------------------------
app.use((req, res, next) => {
    req.session.user = 'tester';
    req.session.isAdmin = true;
    req.session.usersName = 'Tester';
    next();
});

// ---------------------------------------------------------------------------
// Routes — mirrors reference mean-idaho-master/app.js mount order exactly:
//   app.use('/admin', admin)          ← admin.js sub-mounts event_new at /event_new
//   app.use('/', inventoryFilter)     ← SEO filter routes (BEFORE index)
//   app.use('/', index)
// ---------------------------------------------------------------------------
const adminRouter            = require('./routes/admin');
const inventoryFilterRouter  = require('./routes/inventory-filter');
const indexRouter            = require('./routes/index');
const boatsRouter            = require('./routes/boats');

// Redirect root → boats listing
app.get('/', (req, res) => res.redirect('/boats-for-sale'));

// Mount admin FIRST — admin.js internally does router.use('/event_new', event_new)
// so /admin/event_new/* and /admin/events_new are all handled here
app.use('/admin', adminRouter);

app.use('/', inventoryFilterRouter);  // ← SEO filter routes (BEFORE index)
app.use('/', indexRouter);            // ← base listing + feed routes
app.use('/boats', boatsRouter);       // ← boats detail/api routes


    
app.get('/events-idahotwatersports', (req, res, next) => {
    req.params.page = null;
    eventListHandler(req, res, next);
});

app.get('/events-idahotwatersports/:page', (req, res, next) => {
    eventListHandler(req, res, next);
});

function eventListHandler(req, res, next) {
    let db = req.app.db;
    let config = req.app.config;
    let pageSlug = req.params.page;
    let current_page = (req.query.current_page) ? req.query.current_page : 1; 
    let currentdate = moment().tz("America/Los_Angeles").format() 
    currentdate = currentdate.split('-')
    const formattedDate = `${currentdate[0]}-${currentdate[1]}-${currentdate[2]}.059Z`;   
    let todayDate = new Date(formattedDate)
 
    console.log(todayDate, "todayDate")
    Promise.all([ 
        common.selectMenu(db, 'header_menu'), 
        common.selectMenu(db, 'header_menu'), 
        common.selectMenu(db, 'footer_menu'),  
        common.getInventoryMenu(db)
    ])
        .then(async ([menu, modelMenu, footerMenu, inventoryMenu]) => { 
           // var eventData = await db.events_new.find({}).sort({ "sortByStrtDate": 1 }).toArray();
           let numberProducts = 12;

           let skip = 0;
            if (current_page > 1) {
                skip = (current_page - 1) * numberProducts;
            }
            var eventData = await db.events_new.find({ "Status": "Publish" }).sort({ "sortByStrtDate": 1 }).skip(skip).limit(parseInt(numberProducts)).toArray();
            var eventDataNew = await db.events_new.countDocuments({ "Status": "Publish" });
            // console.log("event date nwe", eventDataNew)
            var noOfPages = Math.ceil(eventDataNew / parseInt(numberProducts));
            // console.log(noOfPages);
            // console.log(current_page);
            var scripts = common.getDockingPageScripts();
            scripts.push({
                script: '/assets/js/fancybox/3.0.47/jquery.fancybox.min.js',
                comment: ''
            })

            var styles = common.getMainPageStyles();
            // styles.push({ url: '/assets/css/madis-common-pages-style.css', comment: '' })

            var title, metaDescription, metaTags;
            let pgePath = req.path ? req.path : ""

            if (req.query.load_more == 1) { 
                var result_html = ''; 
                var result_count = eventData; 
                function formatDate(date, format) {  
                    return moment(date).format(format);  
                }
                for (var i = 0; i < result_count.length; i++) {
                    let img = result_count[i].image ? `<img src="${result_count[i].image}" class="" alt="">` : `<img src="https://cdn.mdsbrand.com/madis/assets/images/no_image_available.jpg" alt="">`
                    let blog_date = formatDate(result_count[i].newsAddedDate, "MM/DD/YYYY hh:mmA")
                    let hroImage = result_count[i].hroImage || '';
                    result_html += `
                   <div class="event-listing-col">
                    <div class="event-listing-image">
                         ${result_count[i].thumbImg ?
                            `<a href="/event-detail/${result_count[i].eventSlug}">
                                            <img src="${result_count[i].thumbImg}" alt="">
                                        </a>` :
                            hroImage ?
                                `<a href="/event-detail/${result_count[i].eventSlug}">
                                                <img src="${result_count[i].hroImage}" alt="">
                                            </a>` :
                                `<a href="/event-detail/${result_count[i].eventSlug}">
                                                <img src="https://cdn.mdsbrand.com/madis/assets/images/coming-soon.webp" alt="">
                                            </a>`
                        }
                    </div>

                    <div class="event-content-box">
                      <a href="/event-detail/${result_count[i].eventSlug}"><h6 class="event-title">${result_count[i].eventTitle}</h6></a>
                        <h6 class="event-date">${blog_date}</h6>
                    </div>
                </div>
                `;

                }
                res.json({
                    'current_page': current_page,
                    'pageCount': noOfPages, 
                    'result': result_html 
                });
                return; 
            }
          
            res.render(`${config.themeViews}events_page_new`, {
                modelMenu,
                pgePath,
                pageCount: noOfPages,
                inventoryMenu,
                eventData: eventData,
                current_page,
                config: config,
                site_url: req.protocol + '://' + req.get('host') + req.originalUrl,
                session: req.session,
                menu: menu,
                footerMenu: footerMenu,
                message: common.clearSessionValue(req.session, 'message'),
                messageType: common.clearSessionValue(req.session, 'messageType'),
                helpers: hbs.helpers,
                showFooter: 'showFooter',
                scripts: scripts,
                styles: styles,
                publicMeta: config.publicMeta
            });
        })
        .catch(err => {
            console.error('Error in event list:', err);
            next(err);
        });
}



app.get('/event-detail/:page', async (req, res) => {
    let db = req.app.db;
    let config = req.app.config;
    let pageSlug = req.params.page;

    console.log("Event Detail - Looking for slug:", pageSlug);

    const setting = await db.template_settings.findOne({ page: "event-detail" });
    const currentTemplate = setting?.value || "event-detail";
    console.log("Event Detail current Template is :",currentTemplate)

    Promise.all([
        common.selectMenu(db, 'header_menu'),
        common.selectMenu(db, 'header_menu'),
        common.selectMenu(db, 'footer_menu')
    ])
        .then(async ([menu, modelMenu, footerMenu]) => {
            var eventData = await db.events_new.find({ "eventSlug": pageSlug }).toArray();
            console.log("Event Detail - Found events:", eventData.length);
            if (eventData[0]) {
                let newInvntry = [];
                if (eventData[0].inventory) {
                    eventData[0].inventory.forEach(function (arrayItem) {
                        newInvntry.push(arrayItem.calleriq_boat_id);
                    });
                }
                let inventoryShow = eventData[0].inventory ? eventData[0].inventory : [];
                const query = { calleriq_boat_id: { $in: newInvntry } };
                const sortOrder = newInvntry.map((id, index) => ({ $cond: [{ $eq: ['$calleriq_boat_id', id] }, index, 999999] }));
                let boatDate = await db.boats.aggregate([
                    { $match: query },
                    { $addFields: { order: { $arrayElemAt: [sortOrder, { $indexOfArray: [newInvntry, '$calleriq_boat_id'] }] } } },
                    { $sort: { order: 1 } }
                ]).toArray()

                var scripts = common.getDockingPageScripts();
                scripts.push({
                    comment: ''
                })

                var styles = common.getMainPageStyles();
                // styles.push({ url: '/assets/css/madis-common-pages-style.css', comment: '' })

                // res.render(`${config.themeViews}event-detail`, {
                res.render(`${config.themeViews}${currentTemplate}`, {
                    titleboat: eventData[0]?.metaTitle || `Events | ${config.company_name}`,
                    metaDescription: eventData[0]?.metaDesc || `Event details at ${config.company_name}.`,
                    modelMenu,
                    metaImg: eventData[0].thumbImg,
                    eventData: eventData[0],
                    boatDate,
                    page: "EVENT",
                    config: config,
                    site_url: req.protocol + '://' + req.get('host') + req.originalUrl,
                    session: req.session,
                    menu: menu,
                    footerMenu: footerMenu,
                    message: common.clearSessionValue(req.session, 'message'),
                    messageType: common.clearSessionValue(req.session, 'messageType'),
                    helpers: hbs.helpers,
                    showFooter: 'showFooter',
                    scripts: scripts,
                    styles: styles,
                    publicMeta: config.publicMeta
                });
            }
            else {
                res.render('error', {
                    title: 'Not found',
                    message: 'Boat not found',
                    helpers: hbs.helpers,
                    config,
                    scripts: scripts,
                    styles: common.getMainPageStyles(),
                    showFooter: true,
                    menu: common.getMenu(db),
                    footerMenu: common.selectMenu(db, 'footer_menu'),
                    publicMeta: config.publicMeta
                });
            }
        })
});

    // Handle /event-detail/ without a slug
    app.get('/event-detail/', (req, res) => {
        res.redirect('/events-idahotwatersports');
    });


// ---------------------------------------------------------------------------
// Connect & start
// ---------------------------------------------------------------------------
connectDB().then(() => {
    const rawDb = getDB();

    app.db = new Proxy({}, {
        get(_, collectionName) {
            return rawDb.collection(collectionName);
        },
    });

    inventoryUrl.setLocationSlugs([]);

    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
    });
});