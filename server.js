'use strict';

const express      = require('express');
const path         = require('path');
const session      = require('express-session');
const MongoStore   = require('connect-mongodb-session')(session);
const exphbs       = require('express-handlebars');
const { connectDB, getDB } = require('./config/db');
const inventoryUrl = require('./lib/inventory-url');

const app = express();

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
app.config = {
    siteName:        'Boats App',
    productsPerPage: 12,
    baseUrl:         process.env.BASE_URL || 'http://localhost:3000',
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

// ---------------------------------------------------------------------------
// Routes — inventoryFilter router MUST be mounted BEFORE index router
// (filter-lifecycle.md section 6 — Path A guard requires this)
// ---------------------------------------------------------------------------
const inventoryFilterRouter = require('./routes/inventory-filter');
const indexRouter            = require('./routes/index');
const boatsRouter            = require('./routes/boats');

// Redirect root → boats listing so the filter+sidebar is visible on /
app.get('/', (req, res) => res.redirect('/boats-for-sale'));

app.use('/', inventoryFilterRouter);  // ← SEO filter routes (BEFORE index)
app.use('/', indexRouter);            // ← base listing + feed routes
app.use('/boats', boatsRouter);       // ← boats admin/api routes

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
