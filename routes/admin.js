const express = require('express');
const common = require('../lib/common');
const router = express.Router();

// Mount event_new router under /event_new (NO AUTH - BYPASSED)
const event_new = require('./event_new');
console.log('=== Mounting event_new router at /event_new ===');
router.use('/event_new', event_new);
console.log('=== event_new router mounted ===');

// Admin dashboard (no auth)
router.get('/', (req, res) => {
    res.redirect('/admin/events_new');
});

// Events list page (with "s" - matches reference project)
router.get('/events_new', async (req, res, next) => {
    const db = req.app.db;
    const config = req.app.config;
    const page = 0;

    try {
        const count = await db.events_new.countDocuments({});
        const topResults = await db.events_new.find({}).sort({ sortByStrtDate: 1 }).skip(page * 10).limit(10).toArray();

        const styles = common.getAdminStyles();
        const scripts = common.getHyperAdminPageScripts();
        scripts.push({ script: '/assets/js/fancybox/3.0.47/jquery.fancybox.min.js', comment: '' });
        const noOfPages = Math.ceil(count / 10);
        res.header('Cache-Control', 'no-cache');
        res.render('events_new', {
            title: 'Events',
            top_results: topResults,
            session: req.session,
            admin: true,
            hyper_admin: true,
            pageCount: noOfPages,
            current_page: page + 1,
            config: config,
            site_url: req.protocol + '://' + req.get('host') + req.originalUrl,
            scripts: scripts,
            styles: styles,
            message: common.clearSessionValue(req.session, 'message'),
            messageType: common.clearSessionValue(req.session, 'messageType'),
            helpers: req.handlebars.helpers
        });
    } catch (err) {
        console.error('Error loading events list:', err);
        next(err);
    }
});

// Events list page with pagination
router.get('/events_new/:page', async (req, res, next) => {
    const db = req.app.db;
    const config = req.app.config;
    const page = req.params.page - 1;

    try {
        const count = await db.events_new.countDocuments({});
        const topResults = await db.events_new.find({}).sort({ sortByStrtDate: 1 }).skip(page * 10).limit(10).toArray();

        const styles = common.getAdminStyles();
        const scripts = common.getHyperAdminPageScripts();
        scripts.push({ script: '/assets/js/fancybox/3.0.47/jquery.fancybox.min.js', comment: '' });
        const noOfPages = Math.ceil(count / 10);
        res.header('Cache-Control', 'no-cache');
        res.render('events_new', {
            title: 'Events',
            top_results: topResults,
            session: req.session,
            admin: true,
            hyper_admin: true,
            pageCount: noOfPages,
            current_page: page + 1,
            config: config,
            site_url: req.protocol + '://' + req.get('host') + req.originalUrl,
            scripts: scripts,
            styles: styles,
            message: common.clearSessionValue(req.session, 'message'),
            messageType: common.clearSessionValue(req.session, 'messageType'),
            helpers: req.handlebars.helpers
        });
    } catch (err) {
        console.error('Error loading events list page:', err);
        next(err);
    }
});

module.exports = router;
