'use strict';

/**
 * lib/common.js
 * Extracted from mean-idaho-master/lib/common.js
 * Only contains what the filter system needs: getBoatData()
 */

const inventoryUrl = require('./inventory-url');
const ObjectId = require('mongodb').ObjectId;

// ---------------------------------------------------------------------------
// Helper used by routes/index.js filter logic
// ---------------------------------------------------------------------------

function cleanArray(actual) {
    var newArray = new Array();
    for (var i = 0; i < actual.length; i++) {
        if (actual[i]) {
            newArray.push(actual[i]);
        }
    }
    return newArray;
}

exports.cleanArray = cleanArray;

// ---------------------------------------------------------------------------
// restrict — Pass-through to remove login requirement
// Modified from mean-idaho-master/lib/common.js
// ---------------------------------------------------------------------------

exports.restrict = (req, res, next) => next();

// ---------------------------------------------------------------------------
// checkAccess — Pass-through to remove access restriction
// Modified from mean-idaho-master/lib/common.js
// ---------------------------------------------------------------------------

exports.checkAccess = (req, res, next) => next();

// ---------------------------------------------------------------------------
// getBoatData — the MongoDB aggregate powering all listing pages
// Copied exactly from mean-idaho-master/lib/common.js lines 845-1049
// Only change: removed exports.getConfig() call, hardcoded numberProducts = 12
// ---------------------------------------------------------------------------

exports.getBoatData = (req, page, query, sort) => {
    let db = req.app.db;
    let numberProducts = 12;

    let skip = 0;
    if (page > 1) {
        skip = (page - 1) * numberProducts;
    }

    if (!query) {
        query = {};
    }

    // HP range is not a Mongo operator — strip it before find()/aggregate $match
    var hpRange = query._horsePowerRange || null;
    query = Object.assign({}, query);
    delete query._horsePowerRange;
    delete query.$expr;

    var hpRangeQuery = {};
    if (hpRange) {
        if (hpRange.min != null && !isNaN(hpRange.min)) hpRangeQuery.$gte = hpRange.min;
        if (hpRange.max != null && !isNaN(hpRange.max)) hpRangeQuery.$lte = hpRange.max;
    }
    var hpStages = (hpRange && Object.keys(hpRangeQuery).length)
        ? [
            { $addFields: { hourse_power_num: inventoryUrl.horsePowerNumericExpr() } },
            { $match: { hourse_power_num: hpRangeQuery } }
        ]
        : [];

    function listingPipeline() {
        var stages = [];
        if (Object.keys(query).length) stages.push({ $match: query });
        stages = stages.concat(hpStages);
        stages.push({ $sort: sort || { _id: 1 } });
        stages.push({ $skip: skip });
        stages.push({ $limit: parseInt(numberProducts) });
        return stages;
    }

    function countPipeline() {
        var stages = [];
        if (Object.keys(query).length) stages.push({ $match: query });
        stages = stages.concat(hpStages);
        stages.push({ $count: 'n' });
        return stages;
    }

    let boat_length = { ...query };
    boat_length['boat_length'] = { $nin: [null, '', NaN] };

    let boats_year = { ...query };
    boats_year['boat_year'] = { $nin: [null, '', NaN] };

    let boat_price = { ...query };
    boat_price['boatPrice'] = { $nin: [null, '', NaN] };

    let boat_horse_power = { ...query };
    boat_horse_power['hourse_power'] = { $nin: [null, '', NaN, '0', 0] };

    // Cascading filter arrays:
    // condition selected → brand/class/model/series filtered by condition
    // brand selected    → class/model/series filtered by brand
    // class selected    → model filtered by class
    var boat_class_array    = [];
    var boat_brand_array    = [];
    var boat_category_array = [];
    var boat_model_array    = [];
    var boat_series_array   = [];

    if (query.boat_condition != undefined) {
        var query_brand  = { boat_condition: query.boat_condition };
        var query_class  = { boat_condition: query.boat_condition };
        var query_model  = { boat_condition: query.boat_condition };
        var query_series = { boat_condition: query.boat_condition };
        boat_brand_array.push(query_brand);
        boat_class_array.push(query_class);
        boat_model_array.push(query_model);
        boat_series_array.push(query_series);
    }
    if (query.boat_brand != undefined) {
        var query_class  = { boat_brand: query.boat_brand };
        var query_model  = { boat_brand: query.boat_brand };
        var query_series = { boat_brand: query.boat_brand };
        boat_class_array.push(query_class);
        boat_model_array.push(query_model);
        boat_series_array.push(query_series);
    }
    if (query.category != undefined) {
        var query_brand  = { category: query.category };
        var query_class  = { category: query.category };
        var query_model  = { category: query.category };
        var query_series = { category: query.category };
        boat_brand_array.push(query_brand);
        boat_class_array.push(query_class);
        boat_model_array.push(query_model);
        boat_series_array.push(query_series);
    }
    if (query.boat_class != undefined) {
        var query_model = { boat_class: query.boat_class };
        boat_model_array.push(query_model);
    }

    var query_boat_brand = boat_brand_array.length > 0
        ? [{ '$match': { '$and': boat_brand_array } }, { '$group': { _id: '$boat_brand', doc_id: { '$first': '$_id' }, count: { $sum: 1 } } }, { '$sort': { _id: 1 } }]
        : [{ '$group': { _id: '$boat_brand', doc_id: { '$first': '$_id' }, count: { $sum: 1 } } }, { '$sort': { _id: 1 } }];

    var query_engine_make = boat_brand_array.length > 0
        ? [{ '$match': { '$and': boat_brand_array } }, { '$match': { engine_make: { $nin: [null, '', undefined] } } }, { '$group': { _id: '$engine_make', doc_id: { '$first': '$_id' }, count: { $sum: 1 } } }, { '$sort': { _id: 1 } }]
        : [{ '$match': { engine_make: { $nin: [null, '', undefined] } } }, { '$group': { _id: '$engine_make', doc_id: { '$first': '$_id' }, count: { $sum: 1 } } }, { '$sort': { _id: 1 } }];

    var query_boat_category = boat_category_array.length > 0
        ? [{ '$match': { '$and': boat_category_array } }, { '$group': { _id: '$category', doc_id: { '$first': '$_id' }, count: { $sum: 1 } } }, { '$sort': { _id: 1 } }]
        : [{ '$group': { _id: '$category', doc_id: { '$first': '$_id' }, count: { $sum: 1 } } }, { '$sort': { _id: 1 } }];

    var query_boat_class = boat_class_array.length > 0
        ? [{ '$match': { '$and': boat_class_array } }, { '$group': { _id: '$boat_class', count: { $sum: 1 } } }, { '$sort': { _id: 1 } }]
        : [{ '$group': { _id: '$boat_class', count: { $sum: 1 } } }, { '$sort': { _id: 1 } }];

    var query_boat_model = boat_model_array.length > 0
        ? [{ '$match': { '$and': boat_model_array } }, { '$group': { _id: '$boat_model', count: { $sum: 1 } } }, { '$sort': { _id: 1 } }]
        : [{ '$group': { _id: '$boat_model', count: { $sum: 1 } } }, { '$sort': { _id: 1 } }];

    var query_boat_series = boat_series_array.length > 0
        ? [{ '$match': { '$and': boat_series_array } }, { '$group': { _id: '$boat_series', count: { $sum: 1 } } }, { '$sort': { _id: 1 } }]
        : [{ '$group': { _id: '$boat_series', count: { $sum: 1 } } }, { '$sort': { _id: 1 } }];

    return Promise.all([
        hpStages.length
            ? db.boats.aggregate(listingPipeline()).toArray()
            : db.boats.find(query).sort(sort).skip(skip).limit(parseInt(numberProducts)).toArray(),                        // 0  data
        hpStages.length
            ? db.boats.aggregate(countPipeline()).toArray().then(function (rows) { return rows[0] ? rows[0].n : 0; })
            : db.boats.countDocuments(query),                                                                              // 1  totalProducts
        db.boats.aggregate(query_boat_brand).toArray(),                                                              // 2  boat_brand
        db.boats.aggregate([{ '$group': { _id: '$boat_type', count: { $sum: 1 } } }]).toArray(),                    // 3  boat_type
        db.boats.aggregate(query_boat_class).toArray(),                                                              // 4  boat_class
        db.boats.find({}).limit(4).toArray(),                                                                        // 5  belowSliderBoats
        db.boats.aggregate([{ '$group': { _id: '$boat_condition', count: { $sum: 1 } } }, { '$sort': { _id: 1 } }]).toArray(), // 6  boat_condition
        db.boats.find(boat_length).sort({ boat_length: -1 }).limit(1).project({ _id: 0, boat_length: 1 }).toArray(),// 7  max_Length
        db.boats.find(boat_length).sort({ boat_length:  1 }).limit(1).project({ _id: 0, boat_length: 1 }).toArray(),// 8  min_Length
        db.boats.find(boats_year).sort({ boat_year:    -1 }).limit(1).project({ _id: 0, boat_year: 1   }).toArray(),// 9  max_year
        db.boats.find(boats_year).sort({ boat_year:     1 }).limit(1).project({ _id: 0, boat_year: 1   }).toArray(),// 10 min_year
        db.boats.find(boat_price).sort({ boatPrice:    -1 }).limit(1).project({ _id: 0, boatPrice: 1   }).toArray(),// 11 max_price
        db.boats.find(boat_price).sort({ boatPrice:     1 }).limit(1).project({ _id: 0, boatPrice: 1   }).toArray(),// 12 min_price
        db.boats.aggregate(query_boat_model).toArray(),                                                              // 13 boat_model (with counts)
        db.boats.aggregate(query_boat_series).toArray(),                                                             // 14 boat_series
        db.boats.distinct('boat_model'),                                                                             // 15 distinct boat_model list
        db.boats.aggregate(query_boat_category).toArray(),                                                           // 16 category
        db.boats.aggregate(query_engine_make).toArray(),                                                             // 17 engine_make
        db.boats.aggregate([                                                                                         // 18 max_horse_power
            { $match: boat_horse_power },
            { $addFields: { hourse_power_num: inventoryUrl.horsePowerNumericExpr() } },
            { $match: { hourse_power_num: { $gt: 0 } } },
            { $sort: { hourse_power_num: -1 } },
            { $limit: 1 },
            { $project: { _id: 0, hourse_power: { $toString: '$hourse_power_num' } } }
        ]).toArray(),
        db.boats.aggregate([                                                                                         // 19 min_horse_power
            { $match: boat_horse_power },
            { $addFields: { hourse_power_num: inventoryUrl.horsePowerNumericExpr() } },
            { $match: { hourse_power_num: { $gt: 0 } } },
            { $sort: { hourse_power_num: 1 } },
            { $limit: 1 },
            { $project: { _id: 0, hourse_power: { $toString: '$hourse_power_num' } } }
        ]).toArray(),
    ])
    .then((result) => {
        // Merge distinct boat_model list with counts from aggregate
        var boat_model      = result[15];
        var boat_model_array = [];
        boat_model.forEach((itm) => {
            const resObject = result[13].find(item => item._id === itm);
            if (resObject) {
                boat_model_array.push({ _id: itm, count: resObject.count });
            } else {
                boat_model_array.push({ _id: itm, count: 0 });
            }
        });

        const pageCount = Math.ceil(result[1] / numberProducts);
        return {
            data:            result[0],
            totalProducts:   result[1],
            pageCount:       pageCount,
            boat_brand:      result[2],
            boat_type:       result[3],
            boat_class:      result[4],
            belowSliderBoats: result[5],
            boat_condition:  result[6],
            max_Length:      result[7],
            min_Length:      result[8],
            max_year:        result[9],
            min_year:        result[10],
            max_price:       result[11],
            min_price:       result[12],
            boat_model:      result[13],
            boat_series:     result[14],
            category:        result[16],
            engine_make:     result[17],
            max_horse_power: result[18],
            min_horse_power: result[19],
        };
    })
    .catch((err) => {
        console.error('getBoatData error:', err);
        throw new Error('Error retrieving boat data');
    });
};

// ---------------------------------------------------------------------------
// getClosestLocation — IP-based location lookup for phone number display
// Copied from mean-idaho-master/lib/common.js lines 2553-2584
// ---------------------------------------------------------------------------

const geoip = require('geoip-lite');

const COMPANY_LOCATIONS = [
    { city: 'Nampa',       phone: '208-459-7777', lat: 43.5407, lng: -116.5635 },
    { city: 'Burley',      phone: '208-678-5869', lat: 42.5357, lng: -113.7924 },
    { city: 'Idaho Falls', phone: '208-522-8888', lat: 43.4917, lng: -112.0339 },
    { city: 'McCall',      phone: '208-634-8888', lat: 44.9099, lng: -116.1019 },
];

function haversineDistance(lat1, lng1, lat2, lng2) {
    const R = 3958.8; // Earth radius in miles
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

exports.getClosestLocation = (req) => {
    const raw = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '';
    const ip = raw.split(',')[0].trim();
    const geo = geoip.lookup(ip);
    if (!geo || !geo.ll) return COMPANY_LOCATIONS[0]; // fallback: Nampa
    const [userLat, userLng] = geo.ll;
    return COMPANY_LOCATIONS.reduce((closest, loc) => {
        const d = haversineDistance(userLat, userLng, loc.lat, loc.lng);
        const dClosest = haversineDistance(userLat, userLng, closest.lat, closest.lng);
        return d < dClosest ? loc : closest;
    });
};

// ---------------------------------------------------------------------------
// getId — Convert string to MongoDB ObjectId
// Copied from mean-idaho-master/lib/common.js
// ---------------------------------------------------------------------------

exports.getId = (id) => {
    if (id) {
        if (id.length !== 24) {
            return id;
        }
    }
    return new ObjectId(id);
};

// ---------------------------------------------------------------------------
// clearSessionValue — Clear and return session value
// Copied from mean-idaho-master/lib/common.js line 271
// ---------------------------------------------------------------------------

exports.clearSessionValue = (session, sessionVar) => {
    let temp;
    if (session) {
        temp = session[sessionVar];
        session[sessionVar] = null;
    }
    return temp;
};


// ---------------------------------------------------------------------------
// getMainPageStyles — CSS files for main pages
// Copied from mean-idaho-master/lib/common.js line 788
// ---------------------------------------------------------------------------

// exports.getMainPageStyles = () => {
//     return [
//         { url: 'https://cdn.jsdelivr.net/npm/bootstrap@4.6.2/dist/css/bootstrap.min.css', comment: '' },
//         { url: '/assets/font-awesome/css/font-awesome.min.css', comment: '' },
//         { url: 'https://cdnjs.cloudflare.com/ajax/libs/fancybox/3.0.47/jquery.fancybox.min.css', comment: '' },
//         { url: 'https://fonts.googleapis.com/icon?family=Material+Icons', comment: '' },
//         { url: 'https://cdnjs.cloudflare.com/ajax/libs/OwlCarousel2/2.3.4/assets/owl.carousel.min.css', comment: '' },
//         { url: 'https://cdnjs.cloudflare.com/ajax/libs/OwlCarousel2/2.3.4/assets/owl.theme.default.min.css', comment: '' },
//         { url: '/css/styles.min.css', comment: '' },
//     ];
// };
exports.getMainPageStyles = () => {

    return [
        { url: 'https://cdn.jsdelivr.net/npm/bootstrap@4.6.2/dist/css/bootstrap.min.css', comment: '' },
        // { url: '/assets/css/pushy.css', comment: '' },
        { url: '/assets/font-awesome/css/font-awesome.min.css', comment: '' },
        { url: '/assets/css/fancybox/3.0.47/jquery.fancybox.min.css', comment: '' },
        { url: 'https://fonts.googleapis.com/icon?family=Material+Icons', comment: '' },
        // { url: '/assets/css/style.css', comment: '' },
         { url: '/css/styles.min.css', comment: '' },
    ]

}
// ---------------------------------------------------------------------------
// getDockingPageScripts — JS files for detail pages
// Copied from mean-idaho-master/lib/common.js line 802
// ---------------------------------------------------------------------------

// exports.getDockingPageScripts = () => {
//     return [
//         { script: '/assets/js/jquery.min.js', comment: '' },
//         { script: 'https://cdn.jsdelivr.net/npm/bootstrap@4.6.2/dist/js/bootstrap.bundle.min.js', comment: '' },
//         { script: 'https://cdnjs.cloudflare.com/ajax/libs/fancybox/3.0.47/jquery.fancybox.min.js', comment: '' },
//         { script: '/assets/js/custom.js', comment: '' },
//         { script: 'https://cdn.jsdelivr.net/npm/cleave.js@1.6.0/dist/cleave.min.js', comment: 'Cleave.js for phone input formatting' },
//         { script: 'https://cdn.jsdelivr.net/npm/cleave.js@1.6.0/dist/addons/cleave-phone.us.js', comment: 'US phone formatter addon' },
//         { script: '/assets/js/phone-format-init.js', comment: 'Initialize Cleave on phone inputs' }
//     ];
// };
exports.getDockingPageScripts = () => {
    return [
        { script: '/assets/js/jquery.min.js', comment: '' },
        // { script: '/assets/js/expressCart.js', comment: '' },
        { script: 'https://cdn.jsdelivr.net/npm/bootstrap@4.6.2/dist/js/bootstrap.bundle.min.js', comment: '' },
        { url: '/assets/js/froala_editor_new/css/froala_editor.pkgd.css', comment: '' },
        // { script: '/assets/js/wow.js', comment: '' },
        // { script: '/assets/js/custom.js', comment: '' },
        // { script: '/js/scripts.min.js', comment: '' },
        { script: 'https://cdn.jsdelivr.net/npm/cleave.js@1.6.0/dist/cleave.min.js', comment: 'Cleave.js for phone input formatting' },
        { script: 'https://cdn.jsdelivr.net/npm/cleave.js@1.6.0/dist/addons/cleave-phone.us.js', comment: 'US phone formatter addon' },
        { script: '/assets/js/phone-format-init.js', comment: 'Initialize Cleave on phone inputs' }
    ];
}

// ---------------------------------------------------------------------------
// getAdminStyles — CSS files for admin pages
// Copied from mean-idaho-master/lib/common.js line 818
// ---------------------------------------------------------------------------

exports.getAdminStyles = () => {
    return [
        { url: '/assets/js/froala_editor_new/css/froala_editor.pkgd.css', comment: '' },
        { url: 'https://cdn.jsdelivr.net/npm/bootstrap@4.6.2/dist/css/bootstrap.min.css', comment: '' },
        { url: '/assets/font-awesome/css/font-awesome.min.css', comment: '' },
        { url: 'https://fonts.googleapis.com/icon?family=Material+Icons', comment: '' },
        { url: '/assets/css/style.css', comment: '' },
        { url: 'https://cdn.jsdelivr.net/npm/flatpickr@4.6.13/flatpickr.min.css', comment: 'Flatpickr CSS' },
    ];
}

// ---------------------------------------------------------------------------
// getHyperAdminPageScripts — JS files for hyper admin pages
// Copied from mean-idaho-master/lib/common.js line 751
// ---------------------------------------------------------------------------

exports.getHyperAdminPageScripts = () => {
    return [
        { script: '/assets/hyper/js/vendor.min.js', comment: '' },
        { script: '/assets/hyper/js/app.min.js', comment: '' },
        { script: '/assets/hyper/js/pages/demo.timepicker.js', comment: '' },
        { script: '/assets/js/jquery.min.js', comment: '' },
        { script: 'https://cdn.jsdelivr.net/npm/flatpickr@4.6.13/flatpickr.min.js', comment: 'Flatpickr date picker' },
        { script: 'https://cdn.jsdelivr.net/npm/cleave.js@1.6.0/dist/cleave.min.js', comment: 'Cleave.js for phone input formatting' },
        { script: 'https://cdn.jsdelivr.net/npm/cleave.js@1.6.0/dist/addons/cleave-phone.us.js', comment: 'US phone formatter addon' },
        { script: '/assets/js/phone-format-init.js', comment: 'Initialize Cleave on phone inputs' }
    ];
}
// ---------------------------------------------------------------------------
// getMenu — Get navigation menu from database
// Copied from mean-idaho-master/lib/common.js line 478
// ---------------------------------------------------------------------------

exports.getMenu = (db) => {
    return db.menu.find({}).sort({ priority: 1 }).toArray();
};

// ---------------------------------------------------------------------------
// getInventoryMenu — Get inventory filter menu from database
// Copied from mean-idaho-master/lib/common.js line 545
// ---------------------------------------------------------------------------

exports.getInventoryMenu = (db) => {
    return db.inventory_menu.find({}).sort({ priority: 1 }).toArray();
};

// ---------------------------------------------------------------------------
// selectMenu — Get specific menu by name
// Copied from mean-idaho-master/lib/common.js
// ---------------------------------------------------------------------------

exports.selectMenu = (db, menuName) => {
    return db.menu.findOne({ menuName: menuName });
};

// ---------------------------------------------------------------------------
// getImages — Get images for boat/product/event
// Copied from mean-idaho-master/lib/common.js line 311
// ---------------------------------------------------------------------------

exports.getImages = (dir, pictures_type, req, res, callback) => {
    let db = req.app.db;
    let fileList = [];

    if (typeof pictures_type !== 'undefined' && pictures_type.toLowerCase() == 'boat') {
        db.boats.findOne({ _id: exports.getId(dir) }, (err, boat) => {
            if (err) {
                console.error('Error getting images', err);
                return callback(fileList);
            }

            if (boat && boat.boatImages) {
                boat.boatImages.forEach((image) => {
                    if (image.featured == 1) {
                        fileList.unshift(image);
                    } else {
                        fileList.push(image);
                    }
                });
            }
            return callback(fileList);
        });
    } else if (typeof pictures_type !== 'undefined' && pictures_type.toLowerCase() == 'product') {
        db.products.findOne({ _id: exports.getId(dir) }, (err, product) => {
            if (err) {
                console.error('Error getting images', err);
            }
            if (product && product.productImages) {
                product.productImages.forEach((image) => {
                    fileList.push(image);
                });
            }
            callback(fileList);
        });
    } else {
        callback(fileList);
    }
};

// ---------------------------------------------------------------------------
// showCartCloseBtn — Show/hide cart close button
// Copied from mean-idaho-master/lib/common.js
// ---------------------------------------------------------------------------

exports.showCartCloseBtn = (currentPage) => {
    if (currentPage === 'boat') {
        return true;
    }
    return false;
};

// ---------------------------------------------------------------------------
// getHyperAdminStyles — Styles for hyper admin pages (events module)
// Copied from mean-idaho-master/lib/common.js line 832
// ---------------------------------------------------------------------------

exports.getHyperAdminStyles = () => {
    return [
        { url: '/assets/hyper/vendor/daterangepicker/daterangepicker.css', comment: '' },
        { url: '/assets/hyper/vendor/jsvectormap/jsvectormap.min.css', comment: '' },
        { url: '/assets/hyper/css/vendor.min.css', comment: '' },
        { url: '/assets/hyper/css/app-saas.min.css', comment: '' },
        { url: '/assets/hyper/css/icons.min.css', comment: '' },
    ];
};

// ---------------------------------------------------------------------------
// indexEvents — Index events for search functionality
// Copied from mean-idaho-master/lib/common.js line 1482
// Modified: Simplified to not use lunr indexing since we're removing auth
// ---------------------------------------------------------------------------

exports.indexEvents = (app) => {
    return new Promise((resolve, reject) => {
        app.db.events.find({}).toArray((err, eventsList) => {
            if (err) {
                console.error('Error indexing events:', err);
                reject(err);
            }
            // For now, just store the events list without lunr indexing
            app.eventsIndex = eventsList;
            console.log('- events indexing complete');
            resolve();
        });
    });
};
