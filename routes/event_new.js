const express = require('express');
const common = require('../lib/common');
const router = express.Router();
const { ObjectId } = require('mongodb');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
var moment = require('moment');

// Local disk storage — replaces S3 upload (no AWS credentials needed)
const diskStorage = multer.diskStorage({
    destination: function(req, file, cb) {
        const uploadDir = path.join(__dirname, '..', 'public', 'uploads', 'events');
        fs.mkdirSync(uploadDir, { recursive: true });
        cb(null, uploadDir);
    },
    key: function(req, file, cb) {
        var filename = file.originalname.slice(0, file.originalname.lastIndexOf('.'));
        filename = filename.replace(/ /g, '_');
        cb(null, filename + '_' + Date.now() + path.extname(file.originalname));
    },
    filename: function(req, file, cb) {
        var filename = file.originalname.slice(0, file.originalname.lastIndexOf('.'));
        filename = filename.replace(/ /g, '_');
        cb(null, filename + '_' + Date.now() + path.extname(file.originalname));
    },
});

var upload = multer({ storage: diskStorage });
const storagee = multer.memoryStorage();
const uploade = multer({ storage: storagee });

// var s3 = new aws.S3()

// var upload = multer({
//     storage: multerS3({
//         s3: s3,
//         bucket: 'mean-website-cdn/mean-idaho-staging/events_new',
//         key: function(req, file, cb) {
//            // console.log(req);
//             console.log(file);
//             var filename = file.originalname.slice(0, file.originalname.lastIndexOf('.'))
//             filename = filename.replace(/ /g, '_');
//             cb(null, filename + '_' + Date.now() + path.extname(file.originalname));
//         },
//         ACL: 'public-read'
//     })
// })

function cdnUrl(s3Url) {
    if (!s3Url) return "";
    // If already a local path, return as-is
    if (s3Url.startsWith('/')) return s3Url;
    // Convert S3 URLs to CDN URLs (legacy data)
    return s3Url.replace(
        "https://mean-website-cdn.s3.amazonaws.com",
        "https://cdn.mdsbrand.com"
    );
}

router.post('/flora-upload-image', uploade.single('file'), (req, res) => {
    const file = req.file;
    if (!file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }
    // Save buffer to local uploads folder
    const uploadDir = path.join(__dirname, '..', 'public', 'uploads', 'events');
    fs.mkdirSync(uploadDir, { recursive: true });
    var filename = file.originalname.slice(0, file.originalname.lastIndexOf('.'));
    filename = filename.replace(/ /g, '_');
    var destFilename = filename + '_' + Date.now() + path.extname(file.originalname);
    var destPath = path.join(uploadDir, destFilename);
    fs.writeFile(destPath, file.buffer, (err) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Failed to upload image' });
        }
        var uploadLink = '/uploads/events/' + destFilename;
        res.json({ link: uploadLink });
    });
});
  
// New Route for adding category to news category table
router.post('/insert_category', common.restrict, common.checkAccess, async(req, res) => {
    let db = req.app.db;
    let tag = { 
                events_category: req.body.add_category,
                category_slug: req.body.category_slug,
                category_desc: req.body.category_desc
            };
    try {
        const newDoc = await db.events_category.insertOne(tag);
        console.log('Category Added');
        res.status(201).json({
            message: 'Category Added',
            success: true,
            events_catgory: tag.events_category,
            _id: newDoc.insertedId
        });
    } catch (err) {
        console.error('Error inserting document: ' + err);
        req.session.message = 'Error: Inserting news category';
        req.session.messageType = 'danger';
        res.status(400).json({ message: 'Error Inserting News Category' });
    }
});

router.delete('/delete_event_category/:id', common.restrict, common.checkAccess, async (req, res) => {
    const db = req.app.db;
    const categoryId = common.getId(req.params.id);

    console.log(`Attempting to delete category with ID: ${categoryId}`); // Debugging log

    try {
        const result = await db.events_category.deleteOne({ _id: categoryId });
        if (result.deletedCount === 0) {
            console.log('No category found with ID:', categoryId);
            return res.status(404).json({ success: false, message: 'Category not found' });
        }
        console.log('Category successfully deleted:', categoryId);
        res.status(200).json({ success: true, message: 'Category successfully deleted' });
    } catch (err) {
        console.error('Error deleting category:', err.stack);
        return res.status(500).json({ success: false, message: 'Failed to delete category' });
    }
});

// insert form
router.get('/new', common.restrict, common.checkAccess, async(req, res) => {
    const db = req.app.db;
    let config = req.app.config;
    var styles = common.getAdminStyles()
    let events_catgory = await db.events_category.find({}).toArray();
    styles.push({ url: 'https://cdnjs.cloudflare.com/ajax/libs/summernote/0.8.2/summernote.css', comment: '' })
    styles.push({ url: '/assets/js/DateTimePicker/css/bootstrap-datetimepicker.min.css', comment: '' })
    styles.push({ url: '//code.jquery.com/ui/1.12.1/themes/base/jquery-ui.css', comment: '' })

    //var scripts = common.getDockingPageScripts()
     var scripts = common.getHyperAdminPageScripts()
    scripts.push({ script: 'https://cdnjs.cloudflare.com/ajax/libs/jquery/3.2.1/jquery.min.js', comment: '' })
    scripts.push({ script: 'https://cdnjs.cloudflare.com/ajax/libs/jqueryui/1.12.1/jquery-ui.min.js', comment: '' })
    // scripts.push({ script: 'https://cdnjs.cloudflare.com/ajax/libs/select2/4.0.3/js/select2.min.js', comment: '' })
    scripts.push({ script: '/assets/js/summernote/0.8.2/summernote.min.js', comment: '' })
    scripts.push({ script: '/assets/js/fancybox/3.0.47/jquery.fancybox.min.js', comment: '' })
    scripts.push({ script: '/assets/js/jquery-ui.js', comment: '' })
    scripts.push({ script: '/assets/js/jquery.ui.touch-punch.min.js', comment: '' })
    scripts.push({ script: '/assets/js/DateTimePicker/js/bootstrap-datetimepicker.min.js', comment: '' })

    // const targetScript = '/assets/js/custom.js';

    // Find the index of the target script
    // const index = scripts.findIndex(script => script.script === targetScript);

    // if (index !== -1) {
    //     scripts.splice(index, 0, { script: 'https://cdnjs.cloudflare.com/ajax/libs/select2/4.0.3/js/select2.min.js', comment: '' });
    // }
    let inventoryData =  await db.boats.find({}).toArray();


    res.render('eventNew_new', {
        title: 'New Event',
        //locname,
        //...loc,
        inventoryData,
        session: req.session,
        events_catgory: events_catgory,
        message: common.clearSessionValue(req.session, 'message'),
        messageType: common.clearSessionValue(req.session, 'messageType'),
        editor: true,
        admin: true,
        hyper_admin: true,
        page: 'new_event',
        helpers: req.handlebars.helpers,
        config: req.app.config,
        site_url: req.protocol + '://' + req.get('host') + req.originalUrl,
        scripts: scripts,
        styles: styles,

    });
});

router.post(
  '/insert',
  common.restrict,
  common.checkAccess,
  upload.fields([
    { name: 'heroImg2', maxCount: 5 },
    { name: 'thumbImg', maxCount: 1 },
    { name: 'heroImg', maxCount: 1 }
  ]),
  async (req, res) => {
    const db = req.app.db;
    const moment = require('moment-timezone');
    try {
      const obj = JSON.parse(JSON.stringify(req.body));
      const dateLength = Number(req.body.event_date_length) || 0;

      // Auto-generate slug from title if not provided
      if (!obj.eventSlug && obj.eventTitle) {
        obj.eventSlug = obj.eventTitle
          .toString()
          .toLowerCase()
          .trim()
          .replace(/[^a-z0-9\s-]/g, '')
          .replace(/\s+/g, '-')
          .replace(/-+/g, '-')
          .replace(/^-|-$/g, '');
      }

      // event_delete_date parsing (if present)
      let event_delete_date = obj.event_end_date;
      let newdleteDate = null;
      if (event_delete_date) {
        // expecting something like "2025-09-10T12:34:56.789Z" or "2025-09-10T12:34:56"
        // original code used split('.') so preserve that approach but safer:
        const base = event_delete_date.split('.')[0];
        const formattedDate = base + ':00.000Z';
        newdleteDate = new Date(formattedDate);
        console.log(formattedDate, 'formattedDate');
        console.log(newdleteDate, 'event_delete_date');
      } else {
        console.log('event_end_date is undefined or empty');
      }

      // helper: month name => number (kept in case used later)
      function getMonthNumber(monthName) {
        const months = {
          January: 1,
          February: 2,
          March: 3,
          April: 4,
          May: 5,
          June: 6,
          July: 7,
          August: 8,
          September: 9,
          October: 10,
          November: 11,
          December: 12
        };
        if (!monthName) return null;
        const formattedMonthName =
          monthName.charAt(0).toUpperCase() + monthName.slice(1).toLowerCase();
        return months[formattedMonthName] || null;
      }
      function dateConvrtr(dateStrng) {
        // unused in your code, kept unchanged
        let dateArr = dateStrng.split(',');
        let dateHlf = dateArr[0].split(' ');
        let newDate = `${dateArr[1]}/${getMonthNumber(dateHlf[0])}/${dateHlf[1]}`;
        return newDate;
      }

      // build events array and compute sort date from first event start date
      let events = [];
      let strtDateOfEvnt = '';
      let sortBydate = null;
      for (let i = 0; i < dateLength; i++) {
        events.push({
          _id: new ObjectId(),
          eventDate: obj.event_start_date ? obj.event_start_date[i] : '',
          eventTimeStart: obj.event_star_time ? obj.event_star_time[i] : '',
          eventTimeEnd: obj.event_end_time ? obj.event_end_time[i] : ''
        });
      }
      // compute sortBydate from first start date (if present)
      if (obj.event_start_date && obj.event_start_date[0]) {
        strtDateOfEvnt = obj.event_start_date[0];
        // expecting 'YYYY-MM-DD'
        const dateParts = String(strtDateOfEvnt).split('-');
        if (dateParts.length === 3) {
          const year = parseInt(dateParts[0], 10);
          const month = parseInt(dateParts[1], 10) - 1;
          const day = parseInt(dateParts[2], 10);
          sortBydate = new Date(Date.UTC(year, month, day));
        } else {
          // fallback: try Date parse
          sortBydate = new Date(strtDateOfEvnt);
        }
      }

      // Build brands list (result)
      let result = [];
      const eventModelLen = Number(obj.event_model_length) || 0;
      for (let i = 0; i <= eventModelLen; i++) {
        if (obj[`modelName${i}`]) {
          let combined = [];
          if (Array.isArray(obj[`modelTitle${i}`])) {
            combined = obj[`modelTitle${i}`].map((item, index) => {
              return {
                _id: new ObjectId(),
                model_title: obj[`modelTitle${i}`][index],
                model_link: obj[`modelLink${i}`] ? obj[`modelLink${i}`][index] : ''
              };
            });
          }

          // model image handling: assume heroImg2 images align by brand index (i)
          let imgUrl = '';
          if (obj.imgSrc && obj.imgSrc[i] === 'Yes') {
            if (req.files && req.files['heroImg2'] && req.files['heroImg2'][i]) {
              imgUrl = '/uploads/events/' + path.basename(req.files['heroImg2'][i].path);
            } else {
              imgUrl = '';
            }
          }

          const brandObj = {
            _id: new ObjectId(),
            brand: obj[`modelName${i}`],
            showBrand: obj.showBrand ? obj.showBrand[i] : undefined,
            modelImg: imgUrl,
            model: combined
          };

          result.push(brandObj);
        }
      }

      // inventory normalization: handle string vs array
      let newInv = [];
      if (typeof obj.inventory === 'string') {
        newInv.push(obj.inventory);
      } else {
        newInv = obj.inventory ? obj.inventory : [];
      }

      // fetch boats by calleriq_boat_id if any
      let boatInv = [];
      if (newInv.length > 0) {
        boatInv = await db.boats.find({ calleriq_boat_id: { $in: newInv } }).toArray();
      }
      let newBoat = [];
      newInv.forEach((id) => {
        const botObj = boatInv.find((b) => b.calleriq_boat_id === id);
        if (botObj) {
          newBoat.push({
            calleriq_boat_id: botObj.calleriq_boat_id,
            boatTitle: botObj.boatTitle,
            productImage: botObj.productImage,
            sale_price: botObj.sale_price,
            boatPermalink: botObj.boatPermalink,
            stockNumber: botObj.stock_number
          });
        }
      });

      // formatted current date
      const currentDate = new Date();
      const year = currentDate.getFullYear();
      const month = String(currentDate.getMonth() + 1).padStart(2, '0');
      const day = String(currentDate.getDate()).padStart(2, '0');
      const formattedDate = `${year}-${month}-${day}`;

      // determine event status with timezone check if publish_date provided
      if (req.body.event_status === 'Publish') {
        const eventDate = moment(new Date()).tz('America/Los_Angeles').format();
        if (req.body.publish_date && req.body.publish_date > eventDate) {
          req.body.event_status = 'Scheduled';
        }
      }
      const eventStatus = req.body.event_status || 'Publish';

      // build doc
      let doc = {
        eventTitle: obj.eventTitle,
        eventSlug: obj.eventSlug,
        metaTitle: obj.metaTitle,
        metaDesc: obj.metaDesc,
        Excerpt: obj.Excerpt,
        promotion: obj.promotion ? 'Yes' : 'No',
        events: events,
        strtDateOfEvnt: strtDateOfEvnt,
        sortByStrtDate: sortBydate,
        event_end_date: obj.event_end_date,
        event_delete_date: newdleteDate,
        eventDesc: obj.eventDesc,
        locname: obj.locname,
        street: obj.street,
        event_category: obj.category_val,
        city: obj.city,
        state: obj.state,
        zipcode: obj.zipcode,
        phone: obj.phone,
        Status: eventStatus,
        event_publish_date: req.body.publish_date && req.body.publish_date !== '' ? req.body.publish_date : formattedDate,
        modlTitl: obj.modlTitl,
        invTitle: obj.invTitle,
        btnTitle: obj.btnTitle,
        formCode: obj.formCode,
        brandslist: result,
        inventory: newBoat,
        showWebArr: Array.isArray(obj.websitesToShow) ? obj.websitesToShow : (obj.websitesToShow ? [obj.websitesToShow] : [])
      };

      // hero image
      doc.hroImage = '';
      if (req.files && req.files['heroImg'] && req.files['heroImg'][0]) {
        doc.hroImage = '/uploads/events/' + path.basename(req.files['heroImg'][0].path);
      }

      // thumb image
      doc.thumbImg = '';
      if (req.files && req.files['thumbImg'] && req.files['thumbImg'][0]) {
        doc.thumbImg = '/uploads/events/' + path.basename(req.files['thumbImg'][0].path);
      }

      // check unique slug
      const existingCount = await db.events_new.countDocuments({ eventSlug: obj.eventSlug });
      if (existingCount > 0 && obj.eventSlug !== '') {
        req.session.message = 'Event Slug already exists. Pick a new one.';
        req.session.messageType = 'danger';
        return res.redirect('/admin/event_new/new');
      }

      // insert document
      const insertResult = await db.events_new.insertOne(doc);
      const newId = insertResult.insertedId;

      req.session.message = 'New event successfully created';
      req.session.messageType = 'success';
      return res.redirect('/admin/event_new/edit/' + newId);
    } catch (err) {
      console.error('Error in /insert route:', err);
      req.session.message = 'Error: Inserting event';
      req.session.messageType = 'danger';
      return res.redirect('/admin/event_new/new');
    }
  }
);


router.get('/edit/:id', common.restrict, common.checkAccess, async (req, res) => {
    try {
        const db = req.app.db;

        // Fetch inventory data
        let inventoryData = await db.boats.find({}).toArray();

        // Fetch the event data
        let result = await db.events_new.findOne({ _id: common.getId(req.params.id) });
        if (!result) {
            return res.status(404).send("Event not found");
        }

        // Load styles
        let styles = common.getAdminStyles();
        styles.push({ url: 'https://cdnjs.cloudflare.com/ajax/libs/summernote/0.8.2/summernote.css', comment: '' });
        styles.push({ url: '/assets/js/DateTimePicker/css/bootstrap-datetimepicker.min.css', comment: '' });
        styles.push({ url: '//code.jquery.com/ui/1.12.1/themes/base/jquery-ui.css', comment: '' });

        // Load scripts
        let scripts = common.getHyperAdminPageScripts();
        scripts.push({ script: 'https://cdnjs.cloudflare.com/ajax/libs/jquery/3.2.1/jquery.min.js', comment: '' });
        scripts.push({ script: 'https://cdnjs.cloudflare.com/ajax/libs/jqueryui/1.12.1/jquery-ui.min.js', comment: '' });
        scripts.push({ script: '/assets/js/summernote/0.8.2/summernote.min.js', comment: '' });
        scripts.push({ script: '/assets/js/fancybox/3.0.47/jquery.fancybox.min.js', comment: '' });
        scripts.push({ script: '/assets/js/jquery-ui.js', comment: '' });
        scripts.push({ script: '/assets/js/jquery.ui.touch-punch.min.js', comment: '' });
        scripts.push({ script: '/assets/js/DateTimePicker/js/bootstrap-datetimepicker.min.js', comment: '' });

        // Insert select2 script at the correct position
        // const targetScript = '/assets/js/custom.js';
        // const index = scripts.findIndex(script => script.script === targetScript);
        // if (index !== -1) {
        //     scripts.splice(index, 0, { script: 'https://cdnjs.cloudflare.com/ajax/libs/select2/4.0.3/js/select2.min.js', comment: '' });
        // }

        // Ensure checkArr is an array before querying

        // let checkArr = result.events_category && Array.isArray(result.events_category) ? result.events_category : [result.events_category]

      
        // let events_catgory = await db.events_category.find({ events_category: { $nin: checkArr } }).toArray();
        let checkArr = result.event_category && Array.isArray(result.event_category)
            ? result.event_category
            : [result.event_category];

        // Fetch all categories from the database
        let allCategories = await db.events_category.find({}).toArray();

        // Render the page
        console.log(checkArr,"chkcarraya")
        res.render('eventNew_edit', {
            title: 'Edit Event',
            result,
            inventory: result.inventory,
            admin: true,
            // events_category,
            checkArr,
            allCategories,
          
            hyper_admin: true,
            page: 'edit_event',
            inventoryData,
            session: req.session,
            message: common.clearSessionValue(req.session, 'message'),
            messageType: common.clearSessionValue(req.session, 'messageType'),
            config: req.app.config,
            site_url: req.protocol + '://' + req.get('host') + req.originalUrl,
            editor: true,
            helpers: req.handlebars.helpers,
            scripts,
            styles
        });

    } catch (error) {
        console.error("Error fetching event edit data:", error);
        res.status(500).send("An error occurred while loading the page.");
    }
});


router.post(
  '/update',
  common.restrict,
  common.checkAccess,
  upload.fields([
    { name: 'heroImg2', maxCount: 5 },
    { name: 'thumbImg', maxCount: 1 },
    { name: 'heroImg', maxCount: 1 }
  ]),
  async (req, res) => {
    const db = req.app.db;
    const obj = JSON.parse(JSON.stringify(req.body));

    // Handle event delete date
    let newDeleteDate = null;
    if (obj.event_end_date) {
      const formattedDate = obj.event_end_date.split('.')[0] + ':00.000Z';
      newDeleteDate = new Date(formattedDate);
    }

    function getMonthNumber(monthName) {
      const months = { January:1,February:2,March:3,April:4,May:5,June:6,July:7,August:8,September:9,October:10,November:11,December:12 };
      const formatted = monthName.charAt(0).toUpperCase() + monthName.slice(1).toLowerCase();
      return months[formatted] || null;
    }

    // Prepare events
    let events = [];
    let strtDateOfEvnt = obj.event_start_date[0];
    let sortBydate = null;
    if (strtDateOfEvnt) {
      const dateParts = strtDateOfEvnt.split('-');
      sortBydate = new Date(Date.UTC(dateParts[0], dateParts[1] - 1, dateParts[2]));
    }

    for (let i = 0; i < req.body.event_date_length; i++) {
      events.push({
        _id: new ObjectId(),
        eventDate: obj.event_start_date[i],
        eventTimeStart: obj.event_star_time[i],
        eventTimeEnd: obj.event_end_time[i]
      });
    }

    try {
      // Find existing event
      const news = await db.events_new.findOne({ _id: common.getId(req.body.frmboatId) });
      if (!news) {
        req.session.message = 'Event not found.';
        req.session.messageType = 'danger';
        return res.redirect('/admin/event_new/edit/' + req.body.frmboatId);
      }

      // Check slug uniqueness
      const slugCount = await db.events_new.countDocuments({
        eventSlug: obj.eventSlug,
        _id: { $ne: common.getId(req.body.frmboatId) }
      });

      if (slugCount > 0 && obj.eventSlug !== '') {
        req.session.message = 'Event Slug already exists. Pick a new one.';
        req.session.messageType = 'danger';
        return res.redirect('/admin/event_new/edit/' + req.body.frmboatId);
      }

      // Build brands list
      let result = [];
      for (let i = 0; i < obj.event_model_length; i++) {
        if (obj[`modelName${i}`]) {
          let combined = [];
          if (obj[`modelTitle${i}`]) {
            combined = obj[`modelTitle${i}`].map((item, index) => ({
              _id: new ObjectId(),
              model_title: obj[`modelTitle${i}`][index],
              model_link: obj[`modelLink${i}`] ? obj[`modelLink${i}`][index] : ''
            }));
          }

          let imgUIpld = '';
          if (obj.imgSrc && obj.imgSrc[i] === 'Yes') {
            if (req.files && req.files['heroImg2'] && req.files['heroImg2'][i]) {
              imgUIpld = '/uploads/events/' + path.basename(req.files['heroImg2'][i].path);
            }
          } else if (obj.imgSrc && obj.imgSrc[i] === '1') {
            imgUIpld = news.brandslist && news.brandslist[i] ? news.brandslist[i].modelImg : '';
          }

          result.push({
            _id: new ObjectId(),
            brand: obj[`modelName${i}`],
            showBrand: obj.showBrand && obj.showBrand[i] ? obj.showBrand[i] : 'No',
            modelImg: imgUIpld,
            model: combined
          });
        }
      }

      // Inventory
      let newInv = [];
      if (typeof obj.inventory === 'string') newInv.push(obj.inventory);
      else newInv = obj.inventory ? obj.inventory : [];

      let boatInv = newInv.length > 0 ? await db.boats.find({ calleriq_boat_id: { $in: newInv } }).toArray() : [];
      let newBoat = newInv.map(id => {
        const botObj = boatInv.find(b => b.calleriq_boat_id === id);
        return botObj ? {
          calleriq_boat_id: botObj.calleriq_boat_id,
          boatTitle: botObj.boatTitle,
          productImage: botObj.productImage,
          sale_price: botObj.sale_price,
          boatPermalink: botObj.boatPermalink,
          stockNumber: botObj.stock_number
        } : null;
      }).filter(Boolean);

      // Dates
      const currentDate = new Date();
      const formattedDate = `${currentDate.getFullYear()}-${String(currentDate.getMonth()+1).padStart(2,'0')}-${String(currentDate.getDate()).padStart(2,'0')}`;

      if (req.body.event_status === 'Publish' || req.body.event_status === 'Scheduled') {
        const blogDate = moment(new Date()).tz('America/Los_Angeles').format();
        if (req.body.publish_date > blogDate) req.body.event_status = 'Scheduled';
      }

      // Build doc
      let doc = {
        eventTitle: obj.eventTitle,
        eventSlug: obj.eventSlug,
        metaTitle: obj.metaTitle,
        metaDesc: obj.metaDesc,
        Excerpt: obj.Excerpt,
        promotion: obj.promotion ? 'Yes' : 'No',
        events: events,
        event_end_date: obj.event_end_date,
        event_delete_date: newDeleteDate,
        strtDateOfEvnt: strtDateOfEvnt,
        sortByStrtDate: sortBydate,
        eventDesc: obj.eventDesc,
        locname: obj.locname,
        Status: obj.event_status,
        event_publish_date: req.body.publish_date !== '' ? req.body.publish_date : formattedDate,
        street: obj.street,
        city: obj.city,
        state: obj.state,
        zipcode: obj.zipcode,
        phone: obj.phone,
        modlTitl: obj.modlTitl,
        invTitle: obj.invTitle,
        btnTitle: obj.btnTitle,
        formCode: obj.formCode,
        event_category: obj.category_val,
        brandslist: result,
        inventory: newBoat,
        showWebArr: Array.isArray(obj.websitesToShow) ? obj.websitesToShow : (obj.websitesToShow ? [obj.websitesToShow] : [])
      };

      // Hero image
      if (req.files && req.files['heroImg'] && req.files['heroImg'][0]) {
        doc.hroImage = '/uploads/events/' + path.basename(req.files['heroImg'][0].path);
      } else {
        doc.hroImage = req.body.upload_heroimg;
      }

      // Thumbnail image
      if (req.files && req.files['thumbImg'] && req.files['thumbImg'][0]) {
        doc.thumbImg = '/uploads/events/' + path.basename(req.files['thumbImg'][0].path);
      } else {
        doc.thumbImg = news.thumbImg;
      }

      // Update DB
      await db.events_new.updateOne(
        { _id: common.getId(req.body.frmboatId) },
        { $set: doc }
      );

      req.session.message = 'Successfully saved';
      req.session.messageType = 'success';
      return res.redirect('/admin/event_new/edit/' + req.body.frmboatId);

    } catch (err) {
      console.error('Error in /update route:', err);
      req.session.message = 'Failed to save. Please try again';
      req.session.messageType = 'danger';
      return res.redirect('/admin/event_new/edit/' + req.body.frmboatId);
    }
  }
);



// delete news
router.get('/delete/:id', common.restrict, common.checkAccess, async (req, res) => {
    const db = req.app.db;
    var https = require('https');
    all_boat_images = [];
    // console.log(req.params.id)
    db.events_new.findOne({ _id: common.getId(req.params.id) }, async (err, evt) => {

        if (err) {
            console.info(err.stack);
            return;
        }

        if (evt != null) {

            let evt_img = (evt.eventimg) ? evt.eventimg.split('/').pop() : '';

            if (evt_img != '') {
                all_boat_images.push(evt_img);
            }

            // console.log(all_boat_images)
            all_boat_images.forEach(imgname => {

                if (typeof imgname != 'undefined' || imgname != null) {

                    // Delete local file (image stored as /uploads/events/<filename>)
                    var localFile = path.join(__dirname, '..', 'public', imgname.replace(/^\//, ''));
                    fs.unlink(localFile, (error) => {
                        if (error && error.code !== 'ENOENT') {
                            console.error('Image delete error:', error);
                        }
                    });
                }
            });
        }

    });

    // remove the article
    await db.events_new.deleteOne({ _id: common.getId(req.params.id) });
    req.session.message = 'Event successfully deleted';
    req.session.messageType = 'success';
    res.redirect('/admin/events_new');
});

// deletes a boat image
router.post('/deleteimage', common.restrict, common.checkAccess, (req, res) => {
   
    const db = req.app.db;

    db.events_new.findOne({ _id: common.getId(req.body._id) }, (err, boat) => {

        if (err) {
            console.info(err.stack)
        } else {
            //console.log(boat)
            let img_url = (req.body.img_url) ? req.body.img_url : '';

            var image_part = img_url.split('/').pop();
             console.log(image_part)
            // Delete local file
            var localFile1 = path.join(__dirname, '..', 'public', 'uploads', 'events', image_part);
            fs.unlink(localFile1, (error) => {
                if (error && error.code !== 'ENOENT') console.error('Image delete error:', error);
                else console.log("deleted1");
            });

            let key_name = (req.body.key) ? req.body.key : '';
            const parentId = new ObjectId(req.body._id);
            const childId = new ObjectId(req.body.imgId)
            const filter = { _id: parentId, 'brandslist._id': childId };
            const update = { $set: { 'brandslist.$.modelImg': '' } };
            const result =  db.events_new.updateOne(filter, update ,(err,numReplaced) =>{
                if(err){
                    console.info(err.stack) 
                }
                else{
                    console.log(numReplaced,`herer`);
                    req.session.message = 'Image Successfully Deleted';
                req.session.messageType = 'success';
                res.redirect('/admin/event_new/edit/' + parentId);
                }
            });

            console.log(`${result} document(s) updated.`);
        }
    })

})


router.all('/new__event_category', common.restrict, async (req, res, next) => {
    const db = req.app.db;
    const config = req.app.config;
    const page = req.query.page ? parseInt(req.query.page, 10) - 1 : 0;
    const limit = 20;
    const searchQuery = req.query.search ? req.query.search.trim() : "";
    const filter = searchQuery ? { events_category: { $regex: new RegExp(searchQuery, "i") } } : {};

    try {
        const count = await db.events_category.countDocuments(filter);
        const topResults = await db.events_category.find(filter).sort({}).skip(page * limit).limit(limit).toArray();

        const noOfPages = Math.ceil(count / limit);
        const styles = common.getAdminStyles();
        const scripts = common.getHyperAdminPageScripts();
        scripts.push({ script: '/assets/js/fancybox/3.0.47/jquery.fancybox.min.js', comment: '' });

        res.header('Cache-Control', 'no-cache');
        res.render('new_event_category', {
            title: 'Event Category',
            top_results: topResults,
            session: req.session,
            admin: true,
            hyper_admin: true,
            pageCount: noOfPages,
            current_page: page + 1,
            config: config,
            scripts: scripts,
            styles: styles,
            message: common.clearSessionValue(req.session, 'message'),
            messageType: common.clearSessionValue(req.session, 'messageType'),
            helpers: req.handlebars.helpers,
            searchQuery,
        });
    } catch (err) {
        console.error("Error loading categories:", err);
        req.session.message = "Failed to load categories.";
        req.session.messageType = "danger";
        return res.redirect("/admin/event_new/new__event_category");
    }
});

// Update News Category
router.post('/event_category_update', common.restrict, async (req, res) => {
    const db = req.app.db;

    try {
        // Validate input
        const { frmboatId, category_val, category_slug, category_desc } = req.body;

        if (!frmboatId) {
            req.session.message = 'Invalid category ID.';
            req.session.messageType = 'danger';
            return res.redirect('/admin/news_blog/new_category');
        }

        if (!category_val || category_val.trim() === '') {
            req.session.message = 'Category name cannot be empty.';
            req.session.messageType = 'danger';
            return res.redirect(`/admin/news_blog/news_edit_category/${frmboatId}`);
        }

        // Find existing category
        const news = await db.news_category.findOne({ _id: common.getId(frmboatId) });
        if (!news) {
            req.session.message = 'Category not found.';
            req.session.messageType = 'danger';
            return res.redirect(`/admin/news_blog/news_edit_category/${frmboatId}`);
        }

        // Check for duplicate categories
        const count = await db.news_category.countDocuments({
            news_category: category_val,
            _id: { $ne: common.getId(news._id) },
        });

        if (count > 0) {
            req.session.message = 'Category already exists with this name. Pick a new one.';
            req.session.messageType = 'danger';
            return res.redirect(`/admin/news_blog/news_edit_category/${frmboatId}`);
        }

        // Update the category
        const doc = {
            news_category: category_val,
            category_slug,
            category_desc,
        };

        await db.news_category.updateOne({ _id: common.getId(frmboatId) }, { $set: doc });

        req.session.message = 'Category updated successfully.';
        req.session.messageType = 'success';
        res.redirect('/admin/news_blog/new_category');
    } catch (err) {
        console.error(err.stack);
        req.session.message = 'An error occurred while updating the category.';
        req.session.messageType = 'danger';
        res.redirect(`/admin/news_blog/news_edit_category/${req.body.frmboatId}`);
    }
});

router.all('/event_edit_category/:id', common.restrict, (req, res, next) => {
    const db = req.app.db;
    var config = req.app.config
    //var page = typeof req.params.page === undefined ? 0 : req.params.page - 1
    //var limit = 15;
    // get the top results

    db.news_category.findOne({ _id: common.getId(req.params.id) }, (err, topResults) => {
        if (err) {
            console.info(err.stack)
        }
        var styles = common.getAdminStyles()
        var scripts = common.getHyperAdminPageScripts()
        //more script files for this page
        scripts.push({ script: '/assets/js/fancybox/3.0.47/jquery.fancybox.min.js', comment: '' })

        //var noOfPages = Math.ceil(count / limit);

        res.header('Cache-Control', 'no-cache');
        res.render('event_edit_category', {
            title: 'Edit Category',
            top_results: topResults,
            session: req.session,
            admin: true,
            hyper_admin: true,
           // pageCount: noOfPages,
            //current_page: page + 1,
            config: config,
            scripts: scripts,
            styles: styles,
            message: common.clearSessionValue(req.session, 'message'),
            messageType: common.clearSessionValue(req.session, 'messageType'),
            helpers: req.handlebars.helpers
        })
    });


});




// deletes images from directory when choose file btn clicked 
router.post('/remove_image_from_dir', common.restrict, common.checkAccess, (req, res) => {
    const db = req.app.db;
    db.events_new.findOne({ _id: common.getId(req.body._id) }, (err, boat) => {
        if (err) {
            console.info(err.stack)
        } else {
            let img_url = (req.body.img_url) ? req.body.img_url : '';
            var image_part = img_url.split('/').pop();
            // Delete local file
            var localFile2 = path.join(__dirname, '..', 'public', 'uploads', 'events', image_part);
            fs.unlink(localFile2, (error) => {
                if (error && error.code !== 'ENOENT') console.error('Image delete error:', error);
                else console.log("deleted");
            });

            let key_name = (req.body.key) ? req.body.key : '';
            // console.log(key_name)
            if (key_name == 'eventimg') {
                var query_to_match = { _id: common.getId(req.body._id) };
                var deleteimage = {
                    $set: {
                        [key_name]: ""
                    }
                };
            }
            //           // console.log(query_to_match) 
            //            //console.log(deleteimage)

            db.events_new.updateOne(query_to_match, deleteimage)
                .then(() => res.status(200).send("Image Successfully Removed"))
                .catch(err => { console.info(err.stack); res.status(500).send("Error removing image"); });


        }
    })

})
module.exports = router;