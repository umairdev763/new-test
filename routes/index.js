'use strict';

/**
 * routes/index.js
 *
 * Contains:
 *   GET  /                      — home page
 *   GET  /fetch_salesforce_feed — Salesforce XML sync
 *   ALL  /:type(boats-for-sale|new-boats-for-sale|used-boats-for-sale)/:page?
 *        — base listing route with full session-based filter logic
 *        — copied exactly from mean-idaho-master/routes/index.js lines 3999–4850
 */

const express      = require('express');
const router       = express.Router();
const request      = require('request');
const { ObjectId } = require('mongodb');
const common       = require('../lib/common');
const inventoryUrl = require('../lib/inventory-url');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function cleanArray(actual) {
    var newArray = [];
    for (var i = 0; i < actual.length; i++) {
        if (actual[i]) newArray.push(actual[i]);
    }
    return newArray;
}

// ---------------------------------------------------------------------------
// GET / — Home page
// ---------------------------------------------------------------------------

router.get('/', (req, res) => {
    res.render('index', { title: 'Home', message: 'Welcome to the Boats App!' });
});

// ---------------------------------------------------------------------------
// GET /fetch_salesforce_feed — Salesforce XML sync
// ---------------------------------------------------------------------------

router.get('/fetch_salesforce_feed', (req, res) => {
    const db = req.app.db;
    var xml2js = require('xml2js');
    var parser = new xml2js.Parser();
    var sales_force_boats = [];

    var sales_force_url = 'https://idahowatersports.my.salesforce-sites.com/XMLBoatListings?filter=Website_Listing__c=TRUE';

    request(sales_force_url, (error, resp, body) => {
        if (error) {
            console.log('Request error:', error);
            return res.status(500).send('Error fetching feed: ' + error.message);
        }
        if (resp.statusCode !== 200) {
            return res.status(500).send('Bad status from Salesforce: ' + resp.statusCode);
        }

        parser.parseString(body, async function(err, result) {
            if (err) {
                console.log('XML parse error:', err);
                return res.status(500).send('XML parse error');
            }
            if (!result || !result.boats || !result.boats.boat) {
                return res.status(500).send('Error fetching feeds — no boat data in XML');
            }

            var items = result.boats.boat;
            var all_boats = [];

            if (items.length === 0) return res.status(200).json([]);

            for (var i = 0; i < items.length; i++) {
                var boat = {};
                boat['Sales_force_Id'] = (typeof(items[i].ID) != 'undefined') ? items[i].ID[0] : '';
                sales_force_boats.push(boat['Sales_force_Id']);
                boat['DMID'] = (typeof(items[i].DMID) != 'undefined') ? items[i].DMID[0] : '';

                var boat_condition = (typeof(items[i]['New-Used']) != 'undefined') ? items[i]['New-Used'][0] : '';
                if (boat_condition == 'N') boat['boat_condition'] = 'New';
                else if (boat_condition == 'U' || boat_condition == 'P') boat['boat_condition'] = 'Used';
                else boat['boat_condition'] = '';

                boat['location'] = (typeof(items[i].DMLocation) != 'undefined') ? items[i].DMLocation[0] : '';
                boat['note']     = (typeof(items[i].Note) != 'undefined') ? items[i].Note[0] : 0;
                if (boat['location'] == '') boat['location'] = 0;
                boat['boat_class'] = (typeof(items[i].Class) != 'undefined') ? items[i].Class[0] : '';

                var boat_year = (typeof(items[i].Year) != 'undefined') ? items[i].Year[0] : '';
                boat['boat_year'] = parseInt(boat_year);
                boat['Boat']      = (typeof(items[i].Boat) != 'undefined') ? items[i].Boat[0] : '';
                boat['boat_make'] = (typeof(items[i].Make) != 'undefined') ? items[i].Make[0] : '';

                let boat_brand = (typeof(items[i].Make) !== 'undefined') ? items[i].Make[0].trim() : '';
                boat_brand = boat_brand.replace(' Boats', '').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
                if (boat_brand === 'Mastercraft')        boat['boat_brand'] = 'MasterCraft';
                else if (boat_brand === 'CORRECT CRAFT') boat['boat_brand'] = 'Correct Craft';
                else if (boat_brand === 'Axis Wake Research') boat['boat_brand'] = 'Axis';
                else boat['boat_brand'] = boat_brand;

                boat['boat_model'] = (typeof(items[i].Model) != 'undefined') ? items[i].Model[0] : '';
                if (boat['boat_model'] == '2575 QCW I/O') boat['boat_model'] = '2575 QCW I-O';

                var boat_length = (typeof(items[i].Length) != 'undefined') ? items[i].Length[0] : 0;
                boat['boat_length'] = parseInt(boat_length);

                var price = (typeof(items[i].SalePrice) != 'undefined') ? items[i].SalePrice[0] : '0';
                price = price.toString().replace('$', '').replace(/,/g, '');
                boat['Sale_Price'] = parseInt(price) || 0;

                var msrpprice = (typeof(items[i].MSRP) != 'undefined') ? items[i].MSRP[0] : '0';
                msrpprice = msrpprice.toString().replace('$', '').replace(/,/g, '');
                boat['MSRP']      = parseInt(msrpprice) || 0;
                boat['boatPrice'] = parseInt(price) || 0;

                boat['fuel_type']         = (typeof(items[i].FuelType) != 'undefined') ? items[i].FuelType[0] : '';
                boat['Drive']             = (typeof(items[i].Drive) != 'undefined') ? items[i].Drive[0] : '';
                boat['Torque']            = (typeof(items[i].Torque) != 'undefined') ? items[i].Torque[0] : '';
                boat['Trailer']           = (typeof(items[i].Trailer) != 'undefined') ? items[i].Trailer[0] : '';
                boat['OwnerStreet']       = (typeof(items[i].OwnerStreet) != 'undefined') ? items[i].OwnerStreet[0] : '';
                boat['MainImageURL']      = (typeof(items[i].MainImageURL) != 'undefined') ? items[i].MainImageURL[0] : '';
                boat['MainImageFilename'] = (typeof(items[i].MainImageFilename) != 'undefined') ? items[i].MainImageFilename[0] : '';
                boat['MainImageID']       = (typeof(items[i].MainImageID) != 'undefined') ? items[i].MainImageID[0] : '';
                boat['hull_type']         = (typeof(items[i].HullType) != 'undefined') ? items[i].HullType[0] : '';
                boat['boatDescription']   = (typeof(items[i].Description) != 'undefined') ? items[i].Description[0] : '';
                boat['Description']       = (typeof(items[i].Description) != 'undefined') ? items[i].Description[0] : '';
                boat['telephone']         = (typeof(items[i].OwnerPhone) != 'undefined') ? items[i].OwnerPhone[0] : '';
                boat['Discount']          = (typeof(items[i].Discount) != 'undefined') ? items[i].Discount[0] : '';
                boat['city']              = (typeof(items[i].OwnerCity) != 'undefined') ? items[i].OwnerCity[0] : '';
                boat['state']             = (typeof(items[i].OwnerState) != 'undefined') ? items[i].OwnerState[0] : '';
                boat['zip']               = (typeof(items[i].OwnerZip) != 'undefined') ? items[i].OwnerZip[0] : '';
                boat['stock_number']      = (typeof(items[i].StockNumber) != 'undefined') ? items[i].StockNumber[0] : '';

                boat['boatTitle']          = boat['boat_year'] + ' ' + boat['boat_make'] + ' ' + boat['boat_model'];
                boat['boatTitleForSearch'] = boat['boat_year'] + ' ' + boat['boat_make'] + ' ' + boat['boat_model'] + ' ' + boat['stock_number'];
                boat['Name']               = boat['boat_year'] + ' ' + boat['boat_make'] + ' ' + boat['boat_model'];
                boat['Boat_Full_Name']      = boat['boat_year'] + ' ' + boat['boat_make'] + ' ' + boat['boat_model'];
                var boat_permalink = boat['Boat_Full_Name'].split(' ').join('-').toLowerCase();
                boat['boatPermalink'] = boat_permalink + '-' + boat['Sales_force_Id'];

                boat['engine_model'] = (typeof(items[i].EngineModel) != 'undefined') ? items[i].EngineModel[0] : '';
                boat['engine_make']  = (typeof(items[i].EngineMake) != 'undefined') ? items[i].EngineMake[0] : '';
                boat['engine_hours'] = (typeof(items[i].Hours) != 'undefined') ? items[i].Hours[0] : '';
                boat['hourse_power'] = (typeof(items[i].EngineHorsepower) != 'undefined') ? items[i].EngineHorsepower[0] : '';
                boat['power']        = (typeof(items[i].Power) != 'undefined') ? items[i].Power[0] : '';
                boat['fuel']         = (typeof(items[i].FuelCapacity) != 'undefined') ? items[i].FuelCapacity[0] : '';

                var beam_length = (typeof(items[i].Beam) != 'undefined') ? items[i].Beam[0] : 0;
                boat['beam_length']      = parseInt(beam_length);
                boat['draft']            = (typeof(items[i].Draft) != 'undefined') ? items[i].Draft[0] : '';
                boat['hullId']           = (typeof(items[i].HIN) != 'undefined') ? items[i].HIN[0] : '';
                boat['weight']           = (typeof(items[i].Weight) != 'undefined') ? items[i].Weight[0] : '';
                boat['standard_feature'] = (typeof(items[i].StandardFeaturesList) != 'undefined') ? items[i].StandardFeaturesList[0] : '';
                boat['person_capacity']  = (typeof(items[i].PersonCapacity) != 'undefined') ? items[i].PersonCapacity[0] : '';
                boat['MatterportLink']   = (typeof(items[i].MatterportLink) != 'undefined') ? items[i].MatterportLink[0] : '';

                // Videos
                var videos = [];
                for (var cnt = 1; cnt < 5; cnt++) {
                    let video_name = 'Video' + cnt;
                    let vdeo_path;
                    if (typeof(items[i][video_name]) !== 'undefined') {
                        vdeo_path = items[i][video_name].toString();
                    }
                    if (vdeo_path && vdeo_path !== '') {
                        let new_link = vdeo_path;
                        if (vdeo_path.indexOf('vimeo') >= 0 && vdeo_path.indexOf('player') < 0) {
                            var rep = vdeo_path.replace('https://vimeo.com/', '').split('/');
                            new_link = 'https://player.vimeo.com/video/' + rep[0];
                        }
                        videos.push({ '_id': new ObjectId(), 'video': new_link });
                    }
                }
                boat['videos'] = videos;

                // Options
                var added_options = null;
                if (typeof(items[i].StandardFeatures) != 'undefined' && items[i].StandardFeatures != '') {
                    added_options = items[i].StandardFeatures.toString().split(',');
                }
                boat['added_options'] = added_options;

                var selected_options = null;
                if (typeof(items[i].SelectedOptions) != 'undefined' && items[i].SelectedOptions != '') {
                    if (items[i].SelectedOptions != '<ul></ul>') {
                        selected_options = items[i].SelectedOptions.toString();
                    }
                }
                boat['selected_options'] = selected_options;

                // Images
                boat['PHOTO'] = (typeof(items[i].Image1) != 'undefined') ? items[i].Image1[0] : '';
                let inventory_images = [];
                let is_featured_boat_exist = 0;

                for (var bt = 1; bt < 10000; bt++) {
                    let imag_name = 'Image' + bt;
                    if (typeof(items[i][imag_name]) === 'undefined') break;
                    if (items[i][imag_name].toString().toLowerCase().indexOf('main') >= 0) {
                        is_featured_boat_exist = 1; break;
                    }
                }
                var count = 0;
                for (var bt = 1; bt < 10000; bt++) {
                    let imag_name = 'Image' + bt;
                    if (typeof(items[i][imag_name]) === 'undefined') break;
                    let image_path = items[i][imag_name].toString();
                    let is_featured = image_path.toLowerCase().indexOf('main');
                    let featured;
                    if (is_featured_boat_exist > 0) {
                        featured = (is_featured >= 0) ? 1 : 0;
                        if (is_featured >= 0) boat['productImage'] = image_path;
                    } else if (count === 0) {
                        boat['productImage'] = image_path;
                        featured = 1;
                    } else {
                        featured = 0;
                    }
                    count++;
                    inventory_images.push({ '_id': new ObjectId(), 'image': image_path, 'featured': featured });
                }
                boat['boatImages'] = inventory_images;
                all_boats.push(boat);
            }

            try {
                await db.boats.deleteMany({ 'Sales_force_Id': { $exists: true, $nin: sales_force_boats } });
                await db.sold_boats.deleteMany({ 'Sales_force_Id': { $exists: true, $nin: sales_force_boats }, manuallyChangedStatus: { $ne: true } });
            } catch (delErr) {
                console.log('Delete error:', delErr.message);
            }

            for (const boat of all_boats) {
                try {
                    const manuallySold = await db.sold_boats.findOne({ Sales_force_Id: boat.Sales_force_Id, manuallyChangedStatus: true });
                    if (manuallySold) {
                        const { boat_sale_status, sold_date, manuallyChangedStatus, ...infoOnly } = boat;
                        await db.sold_boats.updateOne({ Sales_force_Id: boat.Sales_force_Id }, { $set: infoOnly });
                    } else {
                        await db.boats.updateOne({ 'Sales_force_Id': boat.Sales_force_Id }, { $set: boat }, { upsert: true });
                        await db.sold_boats.deleteOne({ 'Sales_force_Id': boat.Sales_force_Id, manuallyChangedStatus: { $ne: true } });
                    }
                } catch (saveErr) {
                    console.log('Save error for boat', boat.Sales_force_Id, ':', saveErr.message);
                }
            }

            console.log(`Synced ${all_boats.length} boats to DB`);
            res.json({ success: true, count: all_boats.length, boats: all_boats });
        });
    });
});

// ---------------------------------------------------------------------------
// ALL /:type — Boats listing with full filter logic
// Copied exactly from mean-idaho-master/routes/index.js (router.all line 3999)
// Stripped: colors, schema-builders, selectMenu/getInventoryMenu,
//           getMainPageStyles/getMainPageScripts, clearSessionValue, showCartCloseBtn
// ---------------------------------------------------------------------------

const boatListingPaths = [
    '/boats-for-sale',
    '/boats-for-sale/:page',
    '/new-boats-for-sale',
    '/new-boats-for-sale/:page',
    '/used-boats-for-sale',
    '/used-boats-for-sale/:page',
    '/used-pre-owned-boats-for-sale',
    '/used-pre-owned-boats-for-sale/:page',
];

router.all(boatListingPaths, (req, res, next) => {
    // Derive the route type from the URL path
    req.params.type = req.path.replace(/^\//, '').split('/')[0];

    const sessionName = req.params.type;
    req.session[sessionName] = req.session[sessionName] || {};
    req.body = req.body || {};   // guard — GET requests have no body

    const { type } = req.params;
    let db           = req.app.db;
    let config       = req.app.config;
    let numberProducts = config.productsPerPage ? config.productsPerPage : 12;
    let current_page   = req.query.current_page ? req.query.current_page : 1;

    // Reset all session filter values on a fresh (non-AJAX) page load
    if (req.query.json === 'true') {
        req.session[sessionName].boat_name_val = 0;
        req.session[sessionName].condition_val = 0;
        req.session[sessionName].location_val  = 0;
        req.session[sessionName].brand_val     = 0;
        req.session[sessionName].category_val  = 0;
        req.session[sessionName].boat_type_val = 0;
        req.session[sessionName].class_val     = 0;
        req.session[sessionName].model_val     = 0;
        req.session[sessionName].series_val    = 0;
        req.session[sessionName].length_val    = 0;
        req.session[sessionName].year_val      = 0;
        req.session[sessionName].pricemax_val  = 0;
        req.session[sessionName].engine_make_val = 0;
        req.session[sessionName].horse_power_val = 0;
    }

    if (req.query.shop_all === 'true') {
        req.session[sessionName].boat_name_val = 0;
        req.session[sessionName].condition_val = 0;
        req.session[sessionName].location_val  = 0;
        req.session[sessionName].brand_val     = 0;
        req.session[sessionName].category_val  = 0;
        req.session[sessionName].boat_type_val = 0;
        req.session[sessionName].class_val     = 0;
        req.session[sessionName].model_val     = 0;
        req.session[sessionName].series_val    = 0;
        req.session[sessionName].length_val    = 0;
        req.session[sessionName].year_val      = 0;
        req.session[sessionName].pricemax_val  = 0;
        req.session[sessionName].engine_make_val = 0;
        req.session[sessionName].horse_power_val = 0;
        return res.redirect('/boats-for-sale');
    }

    // ---- Build MongoDB filter from req.body / req.query → session ----
    var filter = {};
    var unfiltered, filtered;

    if (req.body.boat_name_val != 0 && typeof req.body.boat_name_val !== 'undefined'
        || req.query.search != 0 && typeof req.query.search !== 'undefined') {
        let boatTitle = req.body.boat_name_val ? req.body.boat_name_val : req.query.search;
        filter.boatTitle = { $regex: new RegExp('^.*' + boatTitle + '.*$'), $options: 'i' };
        req.session[sessionName].boat_name_val = boatTitle;
        if (req.query.search) {
            if (type === 'used-pre-owned-boats-for-sale' || type === 'used-boats-for-sale') {
                req.session.used_search_val = boatTitle;
            } else {
                req.session.new_search_val = boatTitle;
            }
        }
    }

    if (req.body.location_val != 0 && typeof req.body.location_val !== 'undefined') {
        let boat_location = req.body.location_val;
        boat_location = boat_location.charAt(0).toUpperCase() + boat_location.slice(1);
        if (boat_location.toLowerCase() != 'all,') {
            unfiltered = boat_location.split(',');
            filtered   = cleanArray(unfiltered);
            filter.location = { $in: filtered };
            req.session[sessionName].location_val = boat_location;
        } else {
            filter = {};
            req.session[sessionName].location_val = boat_location;
        }
    }

    if (req.body.condition_val != 0 && typeof req.body.condition_val !== 'undefined'
        || typeof req.query.condition !== 'undefined') {
        let boat_condition = req.body.condition_val ? req.body.condition_val : req.query.condition;
        boat_condition = boat_condition.charAt(0).toUpperCase() + boat_condition.slice(1);
        if (boat_condition.toLowerCase() != 'all,') {
            unfiltered = boat_condition.split(',');
            filtered   = cleanArray(unfiltered);
            filter.boat_condition = { $in: filtered };
            req.session[sessionName].condition_val = boat_condition;
        } else {
            filter = {};
            req.session[sessionName].condition_val = boat_condition;
        }
    } else {
        if (!req.query.json) {
            if (type === 'new-boats-for-sale') {
                req.session[sessionName].condition_val = req.session[sessionName].condition_val
                    ? req.session[sessionName].condition_val : 'New';
            }
            if (type === 'used-pre-owned-boats-for-sale' || type === 'used-boats-for-sale') {
                req.session[sessionName].condition_val = req.session[sessionName].condition_val
                    ? req.session[sessionName].condition_val : 'Used';
            }
        }
    }

    if (req.body.brand_val != 0 && typeof req.body.brand_val !== 'undefined'
        || typeof req.query.brand !== 'undefined') {
        let boat_brand = req.body.brand_val ? req.body.brand_val : req.query.brand;
        unfiltered = boat_brand.split(',');
        filtered   = cleanArray(unfiltered);
        filter.boat_brand = { $in: filtered };
        req.session[sessionName].brand_val = boat_brand;
    }

    if (req.body.model_val != 0 && typeof req.body.model_val !== 'undefined'
        || typeof req.query.model !== 'undefined') {
        let boat_model = req.body.model_val ? req.body.model_val : req.query.model;
        boat_model = boat_model.replace(':', "'");
        unfiltered = boat_model.split(',');
        filtered   = cleanArray(unfiltered);
        filter.boat_model = { $in: filtered };
        req.session[sessionName].model_val = boat_model;
    }

    if (req.body.category_val != 0 && typeof req.body.category_val !== 'undefined'
        || typeof req.query.category !== 'undefined') {
        let category = req.body.category_val ? req.body.category_val : req.query.category;
        category = category.replace(':', "'");
        unfiltered = category.split(',');
        filtered   = cleanArray(unfiltered);
        filter.category = { $in: filtered };
        req.session[sessionName].category_val = category;
    }

    if (req.body.series_val != 0 && typeof req.body.series_val !== 'undefined'
        || typeof req.query.series !== 'undefined') {
        let boat_series = req.body.series_val ? req.body.series_val : req.query.series;
        boat_series = boat_series.replace(':', "'");
        unfiltered = boat_series.split(',');
        filtered   = cleanArray(unfiltered);
        filter.boat_series = { $in: filtered };
        req.session[sessionName].series_val = boat_series;
    }

    if (req.body.boat_type_val != 0 && typeof req.body.boat_type_val !== 'undefined') {
        filter.boat_type = { $regex: new RegExp('^' + req.body.boat_type_val), $options: 'i' };
        req.session[sessionName].boat_type_val = req.body.boat_type_val;
    }

    if (req.body.class_val != 0 && typeof req.body.class_val !== 'undefined'
        || typeof req.query.class !== 'undefined') {
        let boat_class = req.body.class_val ? req.body.class_val : req.query.class;
        boat_class = boat_class.replace(';', '/');
        unfiltered = boat_class.split(',');
        filtered   = cleanArray(unfiltered);
        filter.boat_class = { $in: filtered };
        req.session[sessionName].class_val = boat_class;
    }

    if (req.body.length_val != 0 && typeof req.body.length_val !== 'undefined') {
        let length = req.body.length_val.split('-');
        filter.boat_length = { $gte: parseFloat(length[0]), $lte: parseFloat(length[1]) };
        req.session[sessionName].length_val = req.body.length_val;
    }

    if ((req.body.year_val != 0 && typeof req.body.year_val !== 'undefined')
        || typeof req.query.year !== 'undefined') {
        let boat_year = req.body.year_val ? req.body.year_val : req.query.year;
        let year = boat_year.split('-');
        filter.boat_year = { $gte: parseFloat(year[0]), $lte: parseFloat(year[1]) };
        req.session[sessionName].year_val = boat_year;
    } else if (req.body.year_val == 0) {
        req.session[sessionName].year_val = 0;
    }

    if (req.body.pricemax_val != 0 && typeof req.body.pricemax_val !== 'undefined') {
        let price = req.body.pricemax_val.split('-');
        filter.boatPrice = { $gte: parseInt(price[0]), $lte: parseInt(price[1]) };
        req.session[sessionName].pricemax_val = req.body.pricemax_val;
    } else if (req.body.pricemax_val == 0) {
        req.session[sessionName].pricemax_val = 0;
    }

    if (req.body.engine_make_val != 0 && typeof req.body.engine_make_val !== 'undefined'
        || typeof req.query.engine_make !== 'undefined'
        || typeof req.query['engine-make'] !== 'undefined') {
        let engine_make = req.body.engine_make_val ? req.body.engine_make_val : (req.query.engine_make || req.query['engine-make']);
        if (Array.isArray(engine_make)) engine_make = engine_make.join(',');
        unfiltered = engine_make.split(',');
        filtered   = cleanArray(unfiltered);
        filter.engine_make = { $in: filtered.map(function(v) { return new RegExp('^' + v.trim() + '$', 'i'); }) };
        req.session[sessionName].engine_make_val = engine_make;
    } else if (req.body.engine_make_val == 0) {
        req.session[sessionName].engine_make_val = 0;
    }

    if ((req.body.horse_power_val != 0 && typeof req.body.horse_power_val !== 'undefined')
        || typeof req.query.horse_power !== 'undefined'
        || typeof req.query['horse-power'] !== 'undefined'
        || typeof req.query.hourse_power !== 'undefined') {
        let hpVal = req.body.horse_power_val ? req.body.horse_power_val : (req.query.horse_power || req.query['horse-power'] || req.query.hourse_power);
        let horse_power = hpVal.toString().replace(/hp$/i, '').split('-');
        filter.hourse_power = { $gte: parseFloat(horse_power[0]), $lte: parseFloat(horse_power[1]) };
        req.session[sessionName].horse_power_val = hpVal;
    } else if (req.body.horse_power_val == 0) {
        req.session[sessionName].horse_power_val = 0;
    }

    // Search keyword from session (persisted across requests)
    if ((type === 'boats-for-sale' || type === 'new-boats-for-sale')
        && req.session.new_search_val && req.session.new_search_val !== '0') {
        const regexQuery = { $regex: new RegExp(req.session.new_search_val.trim(), 'i') };
        filter.$or = [
            { boatTitle: regexQuery }, { stock_number: regexQuery },
            { boat_year: regexQuery }, { boat_make: regexQuery }, { boat_model: regexQuery },
        ];
    }
    if ((type === 'used-boats-for-sale' || type === 'used-pre-owned-boats-for-sale')
        && req.session.used_search_val && req.session.used_search_val !== '0') {
        const regexQuery = { $regex: new RegExp(req.session.used_search_val.trim(), 'i') };
        filter.$or = [
            { boatTitle: regexQuery }, { stock_number: regexQuery },
            { boat_year: regexQuery }, { boat_make: regexQuery }, { boat_model: regexQuery },
        ];
    }

    // ---- Restore filter from session if no new POST body values ----
    if (Object.keys(filter).length === 0) {
        const s = req.session[sessionName];

        if (s.boat_name_val != 0 && typeof s.boat_name_val !== 'undefined') {
            filter.boatTitle = { $regex: new RegExp('^.*' + s.boat_name_val + '.*$'), $options: 'i' };
        }
        if (s.condition_val != 0 && typeof s.condition_val !== 'undefined') {
            let c = s.condition_val.charAt(0).toUpperCase() + s.condition_val.slice(1);
            if (c.toLowerCase() !== 'all,') {
                filter.boat_condition = { $in: cleanArray(c.split(',')) };
            }
        }
        if (s.brand_val != 0 && typeof s.brand_val !== 'undefined') {
            filter.boat_brand = { $in: cleanArray(s.brand_val.split(',')) };
        }
        if (s.category_val != 0 && typeof s.category_val !== 'undefined') {
            filter.category = { $in: cleanArray(s.category_val.split(',')) };
        }
        if (s.boat_type_val != 0 && typeof s.boat_type_val !== 'undefined') {
            filter.boat_type = { $regex: new RegExp('^' + s.boat_type_val), $options: 'i' };
        }
        if (s.class_val != 0 && typeof s.class_val !== 'undefined') {
            filter.boat_class = { $in: cleanArray(s.class_val.split(',')) };
        }
        if (s.model_val != 0 && typeof s.model_val !== 'undefined') {
            filter.boat_model = { $in: cleanArray(s.model_val.split(',')) };
        }
        if (s.series_val != 0 && typeof s.series_val !== 'undefined') {
            filter.boat_series = { $in: cleanArray(s.series_val.split(',')) };
        }
        if (s.location_val != 0 && typeof s.location_val !== 'undefined') {
            filter.location = { $in: cleanArray(s.location_val.split(',')) };
        }
        if (s.length_val != 0 && typeof s.length_val !== 'undefined') {
            let length = s.length_val.split('-');
            filter.boat_length = { $gte: parseFloat(length[0]), $lte: parseFloat(length[1]) };
        }
        if (s.year_val != 0 && typeof s.year_val !== 'undefined') {
            let year = s.year_val.split('-');
            filter.boat_year = { $gte: parseFloat(year[0]), $lte: parseFloat(year[1]) };
        }
        if (s.pricemax_val != 0 && typeof s.pricemax_val !== 'undefined') {
            let price = s.pricemax_val.split('-');
            filter.boatPrice = { $gte: parseInt(price[0]), $lte: parseInt(price[1]) };
        }
        if (s.engine_make_val != 0 && typeof s.engine_make_val !== 'undefined') {
            filter.engine_make = { $in: cleanArray(s.engine_make_val.split(',')).map(function(v) { return new RegExp('^' + v.trim() + '$', 'i'); }) };
        }
        if (s.horse_power_val != 0 && typeof s.horse_power_val !== 'undefined') {
            let horse_power = s.horse_power_val.toString().replace(/hp$/i, '').split('-');
            filter.hourse_power = { $gte: parseFloat(horse_power[0]), $lte: parseFloat(horse_power[1]) };
        }
    }

    // ---- Sorting ----
    var sort_by = {};
    if (req.body && req.body.sort_by) {
        req.session[sessionName].sort_by = req.body.sort_by;
        switch (req.body.sort_by) {
            case 'price-low_to_high':          sort_by.boatPrice   =  1; break;
            case 'price-high_to_low':          sort_by.boatPrice   = -1; break;
            case 'length-longest_to_shortest': sort_by.boat_length = -1; break;
            case 'length-shortest_to_longest': sort_by.boat_length =  1; break;
            case 'year-newest_to_oldest':      sort_by.boat_year   = -1; break;
            case 'year-oldest_to_newest':      sort_by.boat_year   =  1; break;
            default: sort_by._id = 1;
        }
    } else if (req.session[sessionName].sort_by) {
        switch (req.session[sessionName].sort_by) {
            case 'price-low_to_high':          sort_by.boatPrice   =  1; break;
            case 'price-high_to_low':          sort_by.boatPrice   = -1; break;
            case 'length-longest_to_shortest': sort_by.boat_length = -1; break;
            case 'length-shortest_to_longest': sort_by.boat_length =  1; break;
            case 'year-newest_to_oldest':      sort_by.boat_year   = -1; break;
            case 'year-oldest_to_newest':      sort_by.boat_year   =  1; break;
            default: sort_by.boat_year = -1;
        }
    } else {
        sort_by.boat_year = -1;
        req.session[sessionName].sort_by = 'year-newest_to_oldest';
    }

    common.getBoatData(req, current_page, filter, sort_by)
        .then(async (results) => {

            // ---- JSON response for AJAX (?json=true) ----
            if (req.query.json === 'true') {
                return res.status(200).json({
                    success:        true,
                    boats:          results.data,
                    boat:           true,
                    boat_condition: results.boat_condition,
                    totalBoats:     results.totalProducts,
                    boat_brand:     results.boat_brand,
                    boat_category:  results.category,
                    boat_model:     results.boat_model,
                    boat_series:    results.boat_series,
                    boat_class:     results.boat_class,
                    maxLength:      results.max_Length[0] ? results.max_Length[0].boat_length : 0,
                    minLength:      results.min_Length[0] ? results.min_Length[0].boat_length : 0,
                    maxYear:        results.max_year[0]   ? results.max_year[0].boat_year     : 0,
                    minYear:        results.min_year[0]   ? results.min_year[0].boat_year     : 0,
                    maxPrice:       results.max_price[0]  ? results.max_price[0].boatPrice    : 0,
                    minPrice:       results.min_price[0]  ? results.min_price[0].boatPrice    : 0,
                    engine_make:    results.engine_make,
                    maxHorsePower:  results.max_horse_power[0] ? parseFloat(results.max_horse_power[0].hourse_power) || 0 : 0,
                    minHorsePower:  results.min_horse_power[0] ? parseFloat(results.min_horse_power[0].hourse_power) || 0 : 0,
                    pageCount:      results.pageCount,
                    current_page:   parseInt(current_page),
                });
            }

            // ---- Load More — copied exactly from reference repo routes/index.js ----
            if (req.query.load_more == 1) {
                var Numberfrmt = Intl.NumberFormat();
                var result_html = '';

                function PaymentLogic(loanAmount) {
                    if (!loanAmount || isNaN(parseFloat(loanAmount))) return '0';
                    var rawLoanAmount   = parseFloat(loanAmount.toString().replace(/[$,]/g, ''));
                    var downPayment     = rawLoanAmount * 0.20;
                    var principalAmount = rawLoanAmount - downPayment;
                    var monthlyRate     = 7.99 / 1200;
                    var numPayments     = 12 * 20;
                    var emi = (principalAmount * monthlyRate * Math.pow(1 + monthlyRate, numPayments)) /
                              (Math.pow(1 + monthlyRate, numPayments) - 1);
                    var finalVal = Math.round(emi * 10) / 10;
                    return finalVal > 0
                        ? finalVal.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 2 })
                        : '0';
                }

                for (var i = 0; i < results.data.length; i++) {
                    var boat = results.data[i];

                    var link = (boat.boat_condition === 'New')
                        ? '/new-boats-for-sale-detail/' + boat.boatPermalink
                        : '/used-pre-owned-boats-for-sale-detail/' + boat.boatPermalink;

                    var boatimg = boat.productImage
                        ? boat.productImage
                        : 'https://cdn.mdsbrand.com/madis/assets/images/no_image_available.jpg';

                    var price_html      = boat.boatPrice ? '  $' + Numberfrmt.format(boat.boatPrice) : 'Request Pricing';
                    var grid_price_html = boat.boatPrice ? '  $' + Numberfrmt.format(boat.boatPrice) : '';
                    var priceLgoic      = boat.boatPrice ? `<div class="pymentBlock"><h4>$${PaymentLogic(boat.boatPrice)}/month</h4><p>240 months, 7.99% APR<br>20% Down Payment</p></div>` : '';
                    var gridpriceLgoic  = boat.boatPrice ? `<li class="grid-price-item">$${PaymentLogic(boat.boatPrice)}/mo*</li>` : '';

                    var boatcnd         = boat.boat_condition  || '';
                    var boatLength      = boat.boat_length     || '';
                    var stocknmbr       = boat.stock_number    || '';
                    var boatPermalink   = boat.boatPermalink   || '';
                    var boatDescription = boat.boatDescription || '';
                    var engine_hours    = boat.engine_hours    || '';
                    var hullId          = boat.hullId          || '';

                    var noteVal = boat.note
                        ? `<span class="item_badge" style="position:absolute;right:12px;top:1%;"><a href="javascript:void(0)">${boat.note}</a></span>`
                        : '';

                    result_html += `
                        <div class="boat-card list-view">
                            <div class="boat-img-box">
                                <a href="${link}"><img src="${boatimg}" class="boat-img" alt="${boatPermalink}"></a>
                                ${noteVal}
                            </div>
                            <div class="boat-content-box">
                                <div class="upper-content-box">
                                    <div class="sm-box-1">
                                        <h2 class="boat-title"><a href="${link}">${boat.boatTitle}</a></h2>
                                        <div class="boat-condition-box">
                                            <ul class="boat-condition-list">
                                                ${boatcnd ? `<li><img src="https://cdn.mdsbrand.com/madis/assets/images/boat-details-icon/condition.png" alt=""> Condition: <span>${boatcnd}</span></li>` : ''}
                                                ${boatLength ? `<li><img src="https://cdn.mdsbrand.com/madis/assets/images/listing images/specs-list-img-1.png" alt="">Length: <span>${boatLength}'</span></li>` : ''}
                                                ${stocknmbr ? `<li><img src="https://cdn.mdsbrand.com/madis/assets/images/listing images/listing-icon-4.png" class="stock-img" alt="">Stock #: <span>${stocknmbr}</span></li>` : ''}
                                                ${engine_hours ? `<li><img src="https://cdn.mdsbrand.com/madis/assets/images/listing images/specs-list-img-3.png" alt="">Hours: <span>${engine_hours} hrs</span></li>` : ''}
                                                ${hullId ? `<li><img src="https://cdn.mdsbrand.com/madis/assets/images/listing images/listing-icon-4.png" class="stock-img" alt="">Serial: <span>${hullId}</span></li>` : ''}
                                            </ul>
                                        </div>
                                    </div>
                                    <div class="sm-box-2">
                                        <div class="pricing-box">
                                            <div class="price-per-month">
                                                <h3 class="card-text">${price_html}</h3>
                                                <div>
                                                    <a href="${link}" class="listing-blue-btn">VIEW DETAILS</a>
                                                    <a href="https://secure.accelerate.dealer.com/dealer/24123" target="_blank" class="listing-skyblue-btn">GET PRE-aPPROVED</a>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                ${boatDescription ? `<div class="bottom-content-box"><div class="desc-box"><h3>DESCRIPTION</h3><div class="listing-desc">${boatDescription} <a href="${link}" class="read-more">MORE BOAT DETAILS</a></div></div></div>` : ''}
                            </div>
                        </div>

                        <div class="grid-boat-card grid-view">
                            <div class="grid-boat-img-box">
                                <a href="${link}"><img src="${boatimg}" class="boat-img" alt="${boatPermalink}"></a>
                                ${noteVal}
                            </div>
                            <div class="grid-boat-content-box">
                                <div class="grid-upper-content-box">
                                    <div class="grid-sm-box-1">
                                        <h2 class="grid-boat-title"><a href="${link}">${boat.boatTitle}</a></h2>
                                        <div class="grid-boat-condition-box">
                                            <div class="grid-price-box">
                                                ${grid_price_html
                                                    ? `<ul><li class="grid-price-item">${grid_price_html}</li>${gridpriceLgoic}</ul>`
                                                    : `<a href="${link}" class="grid-view-details-btn"> View Details</a>`}
                                            </div>
                                            <ul class="grid-boat-condition-list">
                                                ${boatcnd ? `<li class="specs-list-item"><img src="https://cdn.mdsbrand.com/madis/assets/images/boat-details-icon/condition.png" alt=""> ${boatcnd}</li>` : ''}
                                                ${boatLength ? `<li class="specs-list-item"><img src="https://cdn.mdsbrand.com/madis/assets/images/listing images/specs-list-img-1.png" alt=""> ${boatLength}'</li>` : ''}
                                                ${engine_hours ? `<li class="specs-list-item"><img src="https://cdn.mdsbrand.com/madis/assets/images/listing images/specs-list-img-3.png" alt=""> ${engine_hours} hrs</li>` : ''}
                                                ${hullId ? `<li class="specs-list-item"><img src="https://cdn.mdsbrand.com/madis/assets/images/listing images/listing-icon-4.png" class="stock-img" alt="">${hullId}</li>` : ''}
                                            </ul>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    `;
                }

                return res.json({
                    current_page: current_page,
                    pageCount:    results.pageCount,
                    result:       result_html,
                });
            }

            // ---- Full page render ----
            let search_word = '';
            if (req.query.search) {
                search_word = req.query.search;
            } else if (type === 'used-boats-for-sale' || type === 'used-pre-owned-boats-for-sale') {
                search_word = (req.session.used_search_val && req.session.used_search_val !== '0') ? req.session.used_search_val : '';
            } else {
                search_word = (req.session.new_search_val && req.session.new_search_val !== '0') ? req.session.new_search_val : '';
            }

            results.category = (results.category || []).filter(item => item._id);

            return res.render('boats', {
                title:             type.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) + ' | ' + (config.siteName || 'Boats'),
                search_word:       search_word,
                query_text:        type.replace(/-/g, ' '),
                page:              'boats_page',
                pageType:          type,
                results:           results.data,
                boat_condition:    results.boat_condition,
                boat_brand:        results.boat_brand,
                boat_category:     results.category,
                boat_type:         results.boat_type,
                boat_class:        results.boat_class,
                boat_model:        results.boat_model,
                boat_series:       results.boat_series,
                engine_make:       results.engine_make,
                pageCount:         results.pageCount,
                maxLength:         results.max_Length[0] ? results.max_Length[0].boat_length : 0,
                minLength:         results.min_Length[0] ? results.min_Length[0].boat_length : 0,
                maxYear:           results.max_year[0]   ? results.max_year[0].boat_year     : 0,
                minYear:           results.min_year[0]   ? results.min_year[0].boat_year     : 0,
                maxPrice:          results.max_price[0]  ? results.max_price[0].boatPrice    : 0,
                minPrice:          results.min_price[0]  ? results.min_price[0].boatPrice    : 0,
                maxHorsePower:     results.max_horse_power[0] ? parseFloat(results.max_horse_power[0].hourse_power) || 0 : 0,
                minHorsePower:     results.min_horse_power[0] ? parseFloat(results.min_horse_power[0].hourse_power) || 0 : 0,
                current_page:      parseInt(current_page),
                session:           req.session[sessionName],
                message:           '',
                messageType:       '',
                productsPerPage:   numberProducts,
                totalProductCount: results.totalProducts,
                belowSliderBoats:  results.belowSliderBoats,
                pageNum:           1,
                paginateUrl:       type,
                pageTitle:         type.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
                showFooter:        'showFooter',
                canonicalUrl:      req.protocol + '://' + req.get('host') + '/' + type + '/',
                basePath:          type,
                locationSlug:      '',
                locationSlugs:     JSON.stringify(inventoryUrl.getLocationSlugs()),
                filterDefs:        JSON.stringify(inventoryUrl.SIDEBAR_FILTERS),
                filterPanels:      inventoryUrl.buildFilterPanels({
                    boat_condition: results.boat_condition,
                    boat_brand:     results.boat_brand,
                    boat_category:  results.category,
                    boat_model:     results.boat_model,
                    boat_series:    results.boat_series,
                    boat_class:     results.boat_class,
                    engine_make:    results.engine_make,
                    minLength:      results.min_Length[0] ? results.min_Length[0].boat_length : 0,
                    maxLength:      results.max_Length[0] ? results.max_Length[0].boat_length : 0,
                    minYear:        results.min_year[0]   ? results.min_year[0].boat_year     : 0,
                    maxYear:        results.max_year[0]   ? results.max_year[0].boat_year     : 0,
                    minPrice:       results.min_price[0]  ? results.min_price[0].boatPrice    : 0,
                    maxPrice:       results.max_price[0]  ? results.max_price[0].boatPrice    : 0,
                    minHorsePower:  results.min_horse_power[0] ? parseFloat(results.min_horse_power[0].hourse_power) || 0 : 0,
                    maxHorsePower:  results.max_horse_power[0] ? parseFloat(results.max_horse_power[0].hourse_power) || 0 : 0,
                }, req.session[sessionName] || {}),
            });
        })
        .catch((err) => {
            console.error('Error getting boat data:', err);
            return res.status(500).render('error', { title: 'Error', message: 'Failed to load boats' });
        });
});

module.exports = router;
