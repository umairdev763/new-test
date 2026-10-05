'use strict';

/**
 * lib/common.js
 * Extracted from mean-idaho-master/lib/common.js
 * Only contains what the filter system needs: getBoatData()
 */

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
        db.boats.find(query).sort(sort).skip(skip).limit(parseInt(numberProducts)).toArray(),                        // 0  data
        db.boats.countDocuments(query),                                                                              // 1  totalProducts
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
            { $addFields: { hourse_power_num: { $toDouble: '$hourse_power' } } },
            { $match: { hourse_power_num: { $gt: 0 } } },
            { $sort: { hourse_power_num: -1 } },
            { $limit: 1 },
            { $project: { _id: 0, hourse_power: { $toString: '$hourse_power_num' } } }
        ]).toArray(),
        db.boats.aggregate([                                                                                         // 19 min_horse_power
            { $match: boat_horse_power },
            { $addFields: { hourse_power_num: { $toDouble: '$hourse_power' } } },
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
