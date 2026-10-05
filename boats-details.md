# Boat Details Page Lifecycle Documentation

## Overview
This document traces the complete lifecycle of the Boat Details page in the reference project (`mean-idaho-master`), from URL request to client-side rendering.

---

## 1. Route Entry Point

### Primary Route Handler
**File**: `routes/index.js`  
**Line**: 783

```javascript
router.all('/:detail(new-boats-for-sale-detail|used-boats-for-sale-detail|used-pre-owned-boats-for-sale-detail|boats-for-sale-detail)/:id', (req, res) => {
```

### URL Patterns Supported
- `/new-boats-for-sale-detail/:id` - New boats
- `/used-boats-for-sale-detail/:id` - Used boats
- `/used-pre-owned-boats-for-sale-detail/:id` - Pre-owned boats (redirects to used-boats-for-sale-detail)
- `/boats-for-sale-detail/:id` - All boats

### Parameters Received
- `req.params.detail` - The detail page type (e.g., "new-boats-for-sale-detail")
- `req.params.id` - The boat identifier (either MongoDB ObjectId or boatPermalink string)

### Parameter Resolution Logic
**File**: `routes/index.js`  
**Lines**: 789-793

```javascript
if (req.params.id.includes("-")) {
    filter = { boatPermalink: req.params.id };
} else {
    filter = { _id: common.getId(req.params.id) };
}
```

If the ID contains a hyphen, it's treated as a `boatPermalink`. Otherwise, it's converted to a MongoDB ObjectId.

---

## 2. Database Query Phase

### Primary Boat Query
**File**: `routes/index.js`  
**Line**: 795

```javascript
db.boats.findOne(filter, async (err, result) => {
```

- First attempts to find the boat in the `boats` collection
- If not found or `boatPublished === 'false'`, falls back to `sold_boats` collection (line 806)

### Image Retrieval
**File**: `routes/index.js`  
**Line**: 1077

```javascript
common.getImages(result._id, "boat", req, res, async (images) => {
```

**Helper Function**: `lib/common.js`  
**Lines**: 311-382

The `getImages` function:
1. Queries the `boats` collection for the boat document
2. Extracts the `boatImages` array from the document
3. Sorts images: featured images (featured=1) are moved to the front using `unshift()`
4. If not found in `boats`, checks `sold_boats` collection
5. Returns an array of image objects with structure: `{ _id, image, featured }`

### Additional Data Queries

#### Similar/Related Boats
**File**: `routes/index.js`  
**Lines**: 1071-1074

```javascript
db.boats.find({}).limit(5).toArray((err, belowBoats1) => {
    db.boats.find({ boat_brand: currentBrand }).sort({ CreatedDate: -1 }).limit(4).toArray((err, belowproducts1) => {
```

- Fetches 5 random boats for "Similar Listings"
- Fetches 4 boats of the same brand for brand-specific recommendations

#### Special Offers/Events
**File**: `routes/index.js`  
**Lines**: 1118-1135

```javascript
const filters = [];
if (result.boat_condition) filters.push({ boat_conditions: { $in: [result.boat_condition] } });
if (result.boat_year) filters.push({ boat_years: { $in: [result.boat_year.toString()] } });
if (result.boat_make) filters.push({ boat_brands: { $in: [result.boat_make] } });
if (result.boat_model) filters.push({ boat_models: { $in: [result.boat_model] } });
if (result.category) filters.push({ category: { $in: [result.category] } });

const specialDocs = await db.specials.find({ $or: filters }).toArray();
```

Queries the `specials` collection for matching promotional events based on:
- Boat condition
- Boat year
- Boat make/brand
- Boat model
- Category

The results are scored by match count and sorted to find the best matching special offers.

---

## 3. Data Processing & Transformations

### Video URL Processing
**File**: `routes/index.js`  
**Lines**: 1092-1097

```javascript
let [video_url_1, video_url_2, video_url_3, video_url_4] = [result.Video1, result.Video2, result.Video3, result.Video4].map(v => {
    if (v && v.includes('watch?v=')) {
        return v.replace('watch?v=', 'embed/');
    }
    return v;
});
```

Converts YouTube watch URLs to embed URLs for iframe playback.

### Additional Video Collection
**File**: `routes/index.js`  
**Lines**: 1103-1116

```javascript
var all_array = [];
let all_videos = result.video_url || [];
if (all_videos.length > 0) {
    all_videos.forEach(item => {
        if (item.includes('youtu.be')) {
            let id = item.split('/')[3];
            all_array.push({
                type: "video",
                video: 'https://www.youtube.com/watch?v=' + id,
                image: `https://img.youtube.com/vi/${id}/0.jpg`
            });
        }
    });
}
```

Processes additional video URLs and generates YouTube thumbnail URLs.

### Image Deduplication
**File**: `routes/index.js`  
**Lines**: 1079-1090

```javascript
const uniqueImagesByUrl = (imageArr) => {
    const seen = new Set();
    return (imageArr || []).filter(img => {
        const key = img && (img.image || img._id || JSON.stringify(img));
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
    });
};

result.boatImages = uniqueImagesByUrl(result.boatImages);
images = uniqueImagesByUrl(images);
```

Removes duplicate images from both the boat's `boatImages` array and the images returned by `getImages()`.

### SEO Metadata Resolution
**File**: `routes/index.js`  
**Lines**: 1188-1204

```javascript
const boatSeoMeta = await common.getPageMetaV2(db, req.path, {
    boatTitle:      result.boatTitle      || '',
    category:       result.category       || '',
    boat_condition: result.boat_condition || '',
    boat_year:      result.boat_year      || '',
    boat_brand:     result.boat_brand     || result.boat_make || '',
    boat_model:     result.boat_model     || ''
}, '', '');
```

Fetches SEO metadata from the database with boat-specific context for placeholder resolution (e.g., `{{boatTitle}}` in SEO templates).

### Schema Generation
**File**: `routes/index.js`  
**Lines**: 1206-1208

```javascript
res.locals.headSchemas = res.locals.headSchemas || [];
if (res.locals.schemaToggles?.product !== false) res.locals.headSchemas.push(sb.boatDetail(result, config, page_slug, req.params.id));
```

Generates Product schema.org JSON-LD for SEO, handled by `lib/schema-builders.js`.

---

## 4. Template Rendering

### Template Selection
**File**: `routes/index.js`  
**Line**: 1213

```javascript
res.render(`${config.themeViews}boat_detail`, {
```

Renders: `views/themes/Material/boat_detail.hbs`

For sold boats, renders: `views/themes/Material/boat_detail_sold.hbs` (line 1013)

### Data Passed to Template
**File**: `routes/index.js`  
**Lines**: 1214-1247

```javascript
{
    title:           res.locals.titleboat      || boatDefaultTitle,
    titleboat:       res.locals.titleboat      || boatDefaultTitle,
    metaDescription: res.locals.metaDescription || `Check out this ${result.boatTitle} for sale in ${res.locals.cityState}`,
    boat_videos: all_array,
    boat_videos_length: all_array.length,
    url: req.params.id,
    inventoryMenu: common.getInventoryMenu(db),
    results: result,              // Main boat data
    boatOptions,
    images,                       // Image array from getImages()
    page_slug,
    page: 'boat_detail',
    closestContact,
    Video1: video_url_1,
    Video2: video_url_2,
    Video3: video_url_3,
    Video4: video_url_4,
    boatDescription: result.boatDescription,
    pageCloseBtn: common.showCartCloseBtn('boat'),
    config,
    belowBoats1,                  // Similar boats
    belowproducts1,               // Brand-specific boats
    session: req.session,
    pageUrl: config.baseUrl + req.originalUrl,
    message: common.clearSessionValue(req.session, 'message'),
    messageType: common.clearSessionValue(req.session, 'messageType'),
    helpers: req.handlebars.helpers,
    showFooter: 'showFooter',
    menu: await common.getMenu(db),
    footerMenu: await common.selectMenu(db, 'footer_menu'),
    inventoryMenu: await common.getInventoryMenu(db),
    scripts,
    styles,
}
```

---

## 5. Template Structure (boat_detail.hbs)

**File**: `views/themes/Material/boat_detail.hbs`

### Key Sections

#### 5.1 See360 360-Degree Viewer
**Lines**: 226-228

```handlebars
<div class="see360-viewer-wrapper pb-2" id="see360ViewerWrapper">
    <div class="see360-viewer" data-vin="{{results.hullId}}" data-unit-id="{{results.Sales_force_Id}}"></div>
</div>
```

- Attempts to load a 360-degree spin viewer using the hull ID (HIN) or Salesforce ID
- The viewer script is loaded globally in the layout: `views/layouts/layout.hbs` line 109
- If the viewer fails to load or has no spin for this boat, the fallback gallery is revealed (lines 386-438)

#### 5.2 Image Gallery (Owl Carousel)
**Lines**: 230-265

```handlebars
<div class="boat-detail-gallery see360-gallery-pending" id="boatDetailGallery">
    <div class="owl-carousel-parent pb-2">
        <div class="owl-carousel boat-detail-carosuel owl-theme">
            {{#each results.boatImages}}
            <div class="item">
                <div class="boatDetailCarouselImageContainer">
                    <a href="{{this.image}}" data-fancybox="gallery-detail-carousel">
                        <img src="{{this.image}}" alt="{{imgAlt 'boat-detail-gallery-slide' 'Boat Gallery Image' @index}}">
                    </a>
                </div>
            </div>
            {{#ifCond @index '==' 0}}
            {{#if @root.results.videos}}
            {{#each @root.results.videos}}
            <div class="item video-item">
                <div class="boatDetailCarouselImageContainer">
                    <a href="{{this.video}}" data-fancybox="gallery-detail-carousel" class="bd-video-link">
                        <div class="bd-video-item">
                            <img src="{{ytThumb this.video}}" alt="{{imgAlt 'boat-detail-boat-video' 'Boat Video'}}">
                            <div class="bd-video-play"><i class="fa-solid fa-play"></i></div>
                        </div>
                    </a>
                </div>
            </div>
            {{/each}}
            {{/if}}
            {{/ifCond}}
            {{/each}}
        </div>
```

- Loops through `results.boatImages` array
- Video thumbnails are injected after the first image (index 0)
- Uses `data-fancybox` for lightbox functionality
- Uses `ytThumb` helper to generate YouTube thumbnail URLs

#### 5.3 Mobile Slick Slider Gallery
**Lines**: 268-320

```handlebars
<div class="slick-slider-box d-block d-lg-none">
    <div class="slider-for">
        {{#each images}}
        <div class="slider-img">
            <img src="{{this.image}}" alt="{{imgAlt 'boat-detail-slider-main' 'Boat Image Slide' @index}}">
        </div>
        {{#ifCond @index '==' 0}}
        {{#if @root.results.videos}}
        {{#each @root.results.videos}}
        <div class="slider-img video-slider-item">
            <div class="bd-video-item">
                <img src="{{ytThumb this.video}}" alt="{{imgAlt 'boat-detail-boat-video-2' 'Boat Video'}}">
                <div class="bd-video-play"><i class="fa-solid fa-play"></i></div>
            </div>
        </div>
        {{/each}}
        {{/if}}
        {{/ifCond}}
        {{/each}}
    </div>
    <div class="slider-nav overflow-x-hidden mt-3">
        {{#each images}}
            {{#ifCond @root.results.boatImages.length '>=' 3}}
                <div class="slider-nav-img">
                    <img src="{{this.image}}" alt="{{imgAlt 'boat-detail-slider-thumb' 'Boat Thumbnail' @index}}">
                </div>
            {{/ifCond}}
        {{/each}}
    </div>
</div>
```

- Mobile-specific gallery using Slick Slider
- Main slider (`slider-for`) shows full images
- Navigation slider (`slider-nav`) shows thumbnails
- Videos injected after first image

#### 5.4 Desktop Gallery Grid
**Lines**: 325-381

```handlebars
<div class="mobHide mt-3">
    <div class="gallery-row">
        {{#each results.boatImages as |h|}}
            {{#ifCond @index '<' 4}}
            <div class="gallery-cols">
                <div class="gallery-box-img">
                    <a href="{{this.image}}" class="fancybox" rel="group" data-fancybox="boatDetailFancyBox1">
                        <img src="{{this.image}}" alt="{{imgAlt 'boat-detail-this-3' 'This'}}">
                    </a>
                </div>
            </div>
            {{/ifCond}}
            {{#ifCond @index '==' 0}}
            {{#if @root.results.videos}}
            {{#each @root.results.videos}}
            <div class="gallery-cols">
                <div class="gallery-box-img">
                    <a href="{{this.video}}" class="fancybox bd-video-link" rel="group" data-fancybox="boatDetailFancyBox1">
                        <div class="bd-video-item">
                            <img src="{{ytThumb this.video}}" alt="{{imgAlt 'boat-detail-boat-video-4' 'Boat Video'}}">
                            <div class="bd-video-play"><i class="fa-solid fa-play"></i></div>
                        </div>
                    </a>
                </div>
            </div>
            {{/each}}
            {{/if}}
            {{/ifCond}}
        {{/each}}
        {{#each results.boatImages as |h|}}
            {{#ifCond @index '>=' 4}}
            <div class="gallery-cols image-second-sec d-none">
                <div class="gallery-box-img">
                    <a href="{{this.image}}" class="fancybox" rel="group" data-fancybox="boatDetailFancyBox1">
                        <img src="{{this.image}}" alt="{{imgAlt 'boat-detail-this-5' 'This'}}">
                    </a>
                </div>
            </div>
            {{/ifCond}}
        {{/each}}
    </div>
    {{#ifCond @root.results.boatImages.length '>' 4}}
    <div class="more-img-btn">
        <button id="load_more_images">MORE IMAGES</button>
    </div>
    {{/ifCond}}
</div>
```

- Desktop gallery showing first 4 images
- Videos injected after first image
- Images beyond index 4 are hidden by default
- "MORE IMAGES" button reveals hidden images (toggled via client-side JS)

#### 5.5 Specifications Section
**Lines**: 502-651

```handlebars
<div class="specs-container">
    <div class="specs">
        <div class="custom-accordion">
            <div class="custom-accordion-item">
                <div class="accordion-header toggle-header mb-2">
                    <h3>SPECS</h3>
                    <span class="fa fa-minus"></span>
                </div>
                <div class="accordion-content toggle-content specc-show">
                    <div class="specs-row-box">
                        <div class="specs-cols">
                            {{#if results.boat_condition}}
                            <div class="specs-item">
                                <span><img src="https://cdn.mdsbrand.com/madis/assets/images/boat-details-icon/condition.png" alt="{{imgAlt 'boat-detail-spec-condition' 'Condition'}}">Status</span>
                                <span>{{results.boat_condition}}</span>
                            </div>
                            {{/if}}
                            <!-- More spec items... -->
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</div>
```

Displays boat specifications including:
- Condition (New/Used)
- Year
- Make/Manufacturer
- Engine Hours
- Model
- Category
- Type
- Engine Model
- Engine Type
- Engine Description
- Boat Length
- Engine Make
- Engine Year
- Beam
- Hull Type
- Fuel Type
- Stock Number
- HIN (Hull ID)
- Serial Number

#### 5.6 Contact Dealer Form
**Lines**: 801-904

```handlebars
<div class="boat-details-form-sec" id="contact_b_form">
    <div class="inq-form-head">
        <h3 class="text-center right-sidebar-sec-btn">Contact Dealer</h3>
    </div>
    <div class="gtm_form" id="contact_for_boat" data-form-id="VDP Form">
        <div class="form-group">
            <label for="f_name" class="sr-only">First Name</label>
            <input type="text" id="f_name" name="f_name" class="boat-details-form require_check" placeholder="First Name *">
            <div class="field-error" id="error_f_name"></div>
        </div>
        <!-- More fields... -->
        <div class="form-group">
            <input type="hidden" id="boatTitle" name="boatTitle" value="{{results.boatTitle}}">
            <input type="hidden" id="boat_stock_no" name="boat_stock_no" value="{{results.stock_number}}">
            <input type="text" name="honeypot" id="honeypot" class="honeypot" style="display: none;" autocomplete="off" tabindex="-1">
            {{> partials/utm}}
            <div class="btn_wrap text-center">
                <button class="gtm_form_submit details-form-btn g-recaptcha" data-form-id="VDP Form"
                    data-sitekey="{{config.googleCaptchaSiteKey}}" data-callback='contact_for_boat'
                    data-action='submit'>Submit</button>
            </div>
        </div>
    </div>
</div>
```

Form fields:
- First Name (required)
- Last Name (required)
- Email (required)
- Phone (required)
- Zip Code (required)
- Dealership Location (required)
- Comments (optional)
- Keep Informed checkbox
- Allow Text Messages checkbox
- Hidden: boatTitle, stock_number, honeypot (spam protection)
- UTM parameters partial (`partials/utm`)

#### 5.7 Similar Listings Section
**Lines**: 990-1254

```handlebars
<section>
    <div class="container-fluid">
        <div class="row m-0">
            <div class="col-lg-11 mx-auto">
                <div class="similarListingHeadingWrap">
                    <h2 class="similar-heading text-center text-lg-left">Similar Listings</h2>
                </div>
                <div class="similar-boats-box">
                    {{#each belowproducts1}}
                    <div class="grid-boat-card grid-view">
                        <!-- Boat card... -->
                    </div>
                    {{/each}}
                </div>
                <div class="owl-carousel similar-slider owl-theme">
                    {{#each belowproducts1}}
                    <div class="item">
                        <!-- Boat card for carousel... -->
                    </div>
                    {{/each}}
                </div>
            </div>
        </div>
    </div>
</section>
```

Displays similar boats in:
- Grid view (desktop)
- Owl Carousel slider (mobile)

---

## 6. Handlebars Helpers Used

### Helper Registration
**File**: `app.js`  
**Lines**: 126-1017

All helpers are registered in the `handlebars.create({ helpers: { ... } })` configuration.

### Key Helpers for Boat Detail Page

#### priceLogic(boat_msrp, boat_price)
**File**: `app.js`  
**Lines**: 164-195

Generates HTML for price display:
- If both MSRP and Sale Price exist: shows both with strikethrough on MSRP
- If only MSRP: shows MSRP and "Request Pricing"
- If only Sale Price: shows Sale Price
- If neither: shows "Request Pricing"

```javascript
priceLogic: function(boat_msrp, boat_price) {
    // Returns HTML string with formatted prices
}
```

#### CalculatePaymentFromBoatPrice(boat_price)
**File**: `app.js`  
**Lines**: 218-238

Calculates estimated monthly payment:
- 20% down payment
- 7.99% interest rate
- 20-year term
- Returns formatted monthly payment string

#### calculateSavings(boat_msrp, boat_price)
**File**: `app.js`  
**Lines**: 240-254

Calculates and formats savings amount (MSRP - Sale Price).

#### purchasePrice(boat_msrp, boat_price)
**File**: `app.js`  
**Lines**: 197-206

Returns the sale price as a formatted currency string.

#### purchasePrice25Percent(boat_msrp, boat_price)
**File**: `app.js`  
**Lines**: 208-216

Returns 20% of the sale price (for calculator default down payment).

#### ifCond(v1, operator, v2, options)
**File**: `app.js`  
**Lines**: 392-418

Conditional comparison helper supporting: `==`, `!=`, `===`, `<`, `<=`, `>`, `>=`, `&&`, `||`, `%`

Used extensively in the template for conditional rendering.

#### thousandSeprator(stringVal)
**File**: `app.js`  
**Lines**: 332-335, 496-499

Formats numbers with thousand separators (e.g., 1,000,000).

#### imgAlt(key, fallback, index)
**File**: `app.js`  
**Lines**: 956-1003

Dynamic alt text helper:
- Looks up alt text from SEO metadata (`seo.imageAlts`)
- Supports placeholder replacement (e.g., `{{boatTitle}}`)
- Falls back to provided fallback text
- Appends index for uniqueness when needed

#### ytThumb(url)
**File**: `app.js`  
**Lines**: 1004-1016

Generates YouTube thumbnail URL from video URL:
- Extracts video ID from YouTube URLs
- Returns: `https://img.youtube.com/vi/{videoId}/hqdefault.jpg`

#### getMenu(db)
**File**: `lib/common.js`  
**Lines**: 478-543

Fetches navigation menu structure from database.

#### getInventoryMenu(db)
**File**: `lib/common.js`  
**Lines**: 545-572

Fetches inventory filter menu structure from database.

#### getClosestLocation(req)
**File**: `lib/common.js` (implementation varies)

Determines the closest dealership location based on user's location.

---

## 7. Client-Side JavaScript

### Script Loading
**File**: `routes/index.js`  
**Lines**: 800-802

```javascript
var scripts = common.getDockingPageScripts();
scripts.push({ script: '/assets/js/fancybox/3.0.47/jquery.fancybox.min.js', comment: '' });
```

**Scripts loaded** (from `lib/common.js` lines 802-815):
1. `/assets/js/jquery.min.js`
2. `https://cdn.jsdelivr.net/npm/bootstrap@4.6.2/dist/js/bootstrap.bundle.min.js`
3. `/js/scripts.min.js` (main bundled scripts)
4. `https://cdn.jsdelivr.net/npm/cleave.js@1.6.0/dist/cleave.min.js` (phone formatting)
5. `https://cdn.jsdelivr.net/npm/cleave.js@1.6.0/dist/addons/cleave-phone.us.js`
6. `/assets/js/phone-format-init.js`
7. FancyBox (added in route)

### Global Scripts
**File**: `views/layouts/layout.hbs`  
**Lines**: 639-642

```handlebars
<script src="https://cdnjs.cloudflare.com/ajax/libs/OwlCarousel2/2.3.4/owl.carousel.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/js-cookie/2.2.1/js.cookie.js"></script>
<script src="/assets/plugins/slickSlider/slick.js"></script>
```

### See360 360-Degree Viewer
**File**: `views/layouts/layout.hbs`  
**Line**: 109

```html
<script src="https://cdn.see360.ai/viewer/v1/see360.js" data-api-key="sk_e7a4d48bbedd7d34d2a56c2007dc2a2f7a066de59f2cd384dbb915f839545433"></script>
```

- Loaded globally for all pages
- On boat detail pages, the viewer is initialized with `data-vin` and `data-unit-id` attributes
- The template includes fallback logic (lines 386-438 of boat_detail.hbs) to show the static gallery if the viewer fails

### Form Handling
**File**: `public/assets/js/forms.js`  
**Lines**: 429-454

```javascript
function contact_for_boat(token) {
    sendLead({
        form: 'contact_for_boat',
        slug: 'contact_for_boat',
        token: token,
        data: {
            first_name: $('#f_name').val(),
            last_name: $('#l_name').val(),
            email: $('#email').val(),
            phone: $('#phone').val(),
            zipcode: $('#zip_code').val(),
            availability: $('#availability').val(),
            rec_cont_dealership_location: $('#rec-cont-dealership-location').val(),
            boat_name: $('#boatTitle').val(),
            stock_number: $('#boat_stock_no').val(),
            keep_informed: $('#contact_for_boat input[name="keep_informed"]').is(':checked') ? 'Yes' : 'No',
            allow_texts: $('#contact_for_boat input[name="allow_texts"]').is(':checked') ? 'Yes' : 'No'
        }
    });
}
```

This function is called when the Google reCAPTCHA callback completes on the "Contact Dealer" form.

### Client-Side Initialization

#### Owl Carousel Initialization
The Owl Carousel is initialized via the main scripts bundle (`/js/scripts.min.js`). The template includes the carousel HTML structure, and the script automatically initializes elements with the `.owl-carousel` class.

#### Slick Slider Initialization
Similarly, Slick Slider is initialized for mobile galleries via the main scripts bundle.

#### FancyBox Initialization
FancyBox is initialized for image lightboxes. The template uses `data-fancybox` attributes to group images into galleries.

#### "MORE IMAGES" Button
The "MORE IMAGES" button (line 377 of boat_detail.hbs) toggles the visibility of hidden images. This logic is in the main scripts bundle.

#### See360 Fallback Logic
**File**: `views/themes/Material/boat_detail.hbs`  
**Lines**: 386-438

```javascript
(function () {
    var wrapper = document.getElementById('see360ViewerWrapper');
    var gallery = document.getElementById('boatDetailGallery');
    var viewer = wrapper && wrapper.querySelector('.see360-viewer');
    if (!viewer || !gallery) return;

    var settled = false;
    var observer = new MutationObserver(check);
    var timer = setTimeout(function () {
        if (!viewer.querySelector('.see360-badge')) showGallery();
    }, 15000);

    function settle() {
        settled = true;
        observer.disconnect();
        clearTimeout(timer);
    }

    function showGallery() {
        if (settled) return;
        settle();
        wrapper.parentNode.removeChild(wrapper);
        gallery.classList.remove('see360-gallery-pending');
        if (window.jQuery) {
            jQuery('.boat-detail-carosuel').trigger('refresh.owl.carousel');
            jQuery('.slider-for.slick-initialized, .slider-nav.slick-initialized').slick('setPosition');
        }
    }

    function showViewer() {
        if (settled) return;
        settle();
        gallery.parentNode.removeChild(gallery);
    }

    function check() {
        if (viewer.querySelector('.see360-error')) showGallery();
        else if (viewer.querySelector('.see360-badge')) showViewer();
    }

    observer.observe(viewer, { childList: true });
    check();
    document.addEventListener('DOMContentLoaded', function () {
        if (!window.See360) showGallery();
    });
})();
```

This script:
- Observes the See360 viewer for success (`.see360-badge`) or error (`.see360-error`)
- If the viewer loads successfully, removes the static gallery
- If the viewer fails or times out (15 seconds), removes the viewer and shows the static gallery
- Refreshes Owl Carousel and Slick Slider dimensions after revealing the gallery

---

## 8. Salesforce Feed Integration (`/fetch_salesforce_feed`)

### Route Definition
**File**: `routes/index.js`  
**Line**: 7322

```javascript
router.get('/fetch_salesforce_feed', (req, res) => {
```

### Purpose
This is a **background sync endpoint**, NOT directly called when loading a boat detail page. It periodically fetches boat data from Salesforce and syncs it to MongoDB.

### Data Flow

1. **Fetch XML from Salesforce**
   **File**: `routes/index.js`  
   **Lines**: 7335-7337

   ```javascript
   var sales_force_url = 'https://idahowatersports.my.salesforce-sites.com/XMLBoatListings?filter=Website_Listing__c=TRUE';
   request(sales_force_url, options, (error, resp, body) => {
   ```

2. **Parse XML to JSON**
   **File**: `routes/index.js`  
   **Lines**: 7342-7345

   ```javascript
   parser.parseString(body, function(err, result) {
       if (result && result.boats && result.boats.boat) {
           var items = result.boats.boat;
   ```

3. **Transform and Map Data**
   **File**: `routes/index.js`  
   **Lines**: 7348-7600

   For each boat in the XML:
   - Maps Salesforce fields to MongoDB schema
   - Normalizes boat brand names (e.g., "Mastercraft" → "MasterCraft")
   - Processes video URLs (converts to embed URLs)
   - Processes images (detects featured images, structures image array)
   - Calculates boat title and permalink
   - Parses boat length, beam, and other specifications

4. **Sync to MongoDB**
   **File**: `routes/index.js`  
   **Lines**: 7605-7622

   ```javascript
   db.boats.deleteMany({ 'Sales_force_Id': { $exists: true, $nin: sales_force_boats } });
   db.sold_boats.deleteMany({ 'Sales_force_Id': { $exists: true, $nin: sales_force_boats }, manuallyChangedStatus: { $ne: true } });

   all_boats.forEach(async(boat, index) => {
       const manuallySold = await db.sold_boats.findOne({ Sales_force_Id: boat.Sales_force_Id, manuallyChangedStatus: true });
       if (manuallySold) {
           const { boat_sale_status, sold_date, manuallyChangedStatus, ...infoOnly } = boat;
           await db.sold_boats.updateOne({ Sales_force_Id: boat.Sales_force_Id }, { $set: infoOnly });
       } else {
           let r = await db.boats.updateOne({ 'Sales_force_Id': boat.Sales_force_Id }, { $set: boat }, { 'upsert': true });
           let r2 = await db.sold_boats.remove({ 'Sales_force_Id': boat.Sales_force_Id, manuallyChangedStatus: { $ne: true } });
       }
       if (index == all_boats.length - 1) {
           await common.updateInventoryMenu(db)
       }
   })
   ```

   - Deletes boats from MongoDB that are no longer in Salesforce feed
   - Updates existing boats or inserts new ones (upsert)
   - Preserves manually set "sold" status
   - Updates inventory menu after sync completes

5. **Response**
   **File**: `routes/index.js`  
   **Line**: 7623

   ```javascript
   res.json(all_boats);
   ```

   Returns the synced boat data as JSON.

### Relationship to Boat Detail Page
- The boat detail page reads from MongoDB (`db.boats` or `db.sold_boats`)
- The `/fetch_salesforce_feed` endpoint populates MongoDB from Salesforce
- This is a **decoupled architecture**: the detail page does not call Salesforce directly
- The sync is typically triggered by a cron job or manual admin action, not by user page loads

---

## 9. Complete Lifecycle Sequence

### User Opens Boat Detail URL

1. **Request Received**
   - User navigates to: `/new-boats-for-sale-detail/2021-mastercraft-x24-123456`
   - Express routes to: `routes/index.js` line 783
   - Parameters extracted: `detail = "new-boats-for-sale-detail"`, `id = "2021-mastercraft-x24-123456"`

2. **Database Query**
   - Route checks if ID contains hyphen → treats as `boatPermalink`
   - Queries `db.boats.findOne({ boatPermalink: "2021-mastercraft-x24-123456" })`
   - If not found or unpublished, queries `db.sold_boats` collection

3. **Image Retrieval**
   - Calls `common.getImages(boatId, "boat", req, res, callback)`
   - Fetches `boatImages` array from boat document
   - Sorts images (featured first)
   - Returns image array to route

4. **Additional Data Fetching**
   - Fetches 5 random boats for "Similar Listings"
   - Fetches 4 boats of same brand
   - Queries `specials` collection for matching promotional events
   - Scores and sorts special offers by match relevance

5. **Data Processing**
   - Converts YouTube watch URLs to embed URLs
   - Processes additional video URLs, generates thumbnails
   - Deduplicates images (both `boatImages` and `getImages` results)
   - Resolves SEO metadata with boat-specific context
   - Generates Product schema.org JSON-LD

6. **Template Rendering**
   - Selects template: `views/themes/Material/boat_detail.hbs`
   - Passes comprehensive data object including:
     - Boat data (`results`)
     - Images (`images`)
     - Videos (`boat_videos`, `Video1-4`)
     - Similar boats (`belowBoats1`, `belowproducts1`)
     - SEO data
     - Menu structures
     - Configuration
     - Scripts and styles

7. **HTML Generation**
   - Handlebars renders template with helpers
   - Layout wrapper applied: `views/layouts/layout.hbs`
   - See360 viewer markup generated with `data-vin` and `data-unit-id`
   - Image galleries (Owl Carousel, Slick Slider, grid) generated
   - Contact form generated with hidden boat identifiers

8. **Response Sent**
   - Full HTML page sent to browser
   - Includes:
     - CSS (Bootstrap, custom styles, Owl Carousel, FancyBox)
     - JavaScript (jQuery, Bootstrap, Owl Carousel, Slick Slider, FancyBox, main scripts)
     - See360 viewer script (global)
     - Form handling scripts

9. **Client-Side Initialization**
   - See360 viewer attempts to load 360-degree spin
   - Owl Carousel initializes image slider
   - Slick Slider initializes mobile gallery
   - FancyBox initializes lightbox
   - Phone input formatting initialized (Cleave.js)
   - See360 fallback observer watches for viewer success/failure

10. **User Interaction**
    - If See360 loads successfully: shows 360-degree viewer, hides static gallery
    - If See360 fails: shows static image gallery, hides viewer
    - User can browse images via carousel/slider
    - User can click images to open FancyBox lightbox
    - User can play videos via FancyBox or embedded iframes
    - User can submit "Contact Dealer" form (triggers `contact_for_boat()` with reCAPTCHA)

---

## 10. Key Files Summary

| File | Purpose |
|------|---------|
| `routes/index.js` (line 783) | Main boat detail route handler |
| `routes/index.js` (line 7322) | Salesforce feed sync endpoint (background) |
| `views/themes/Material/boat_detail.hbs` | Boat detail template |
| `views/themes/Material/boat_detail_sold.hbs` | Sold boat detail template |
| `views/layouts/layout.hbs` | Main layout wrapper (scripts, styles, See360) |
| `lib/common.js` (line 311) | `getImages()` helper function |
| `lib/common.js` (line 770) | `getMainPageScripts()` function |
| `lib/common.js` (line 478) | `getMenu()` function |
| `lib/common.js` (line 545) | `getInventoryMenu()` function |
| `app.js` (line 126) | Handlebars helpers registration |
| `public/assets/js/forms.js` (line 429) | Contact form handler (`contact_for_boat`) |
| `dist/js/scripts.min.js` | Main bundled client-side scripts |
| `lib/schema-builders.js` | Schema.org JSON-LD generation |

---

## 11. Data Flow Diagram

```
User Request
    ↓
/routes/index.js (line 783)
    ↓
MongoDB Query (db.boats / db.sold_boats)
    ↓
common.getImages() → Image Array
    ↓
Additional Queries:
  - Similar boats
  - Brand boats
  - Special offers
    ↓
Data Processing:
  - Video URL conversion
  - Image deduplication
  - SEO metadata resolution
  - Schema generation
    ↓
Template Rendering (boat_detail.hbs)
    ↓
HTML + CSS + JS → Browser
    ↓
Client-Side Initialization:
  - See360 viewer
  - Owl Carousel
  - Slick Slider
  - FancyBox
  - Form handlers
    ↓
User Interaction
```

---

## 12. Salesforce Feed Relationship

```
Salesforce XML Feed
    ↓
/fetch_salesforce_feed (background sync)
    ↓
XML Parsing & Transformation
    ↓
MongoDB Upsert (db.boats / db.sold_boats)
    ↓
Boat Detail Page reads from MongoDB
    ↓
Display to User
```

**Important**: The boat detail page does NOT call `/fetch_salesforce_feed`. This endpoint is for background data synchronization only. The detail page reads from the already-synced MongoDB data.

---

## 13. Special Considerations

### Sold Boats
- Sold boats are stored in `db.sold_boats` collection
- If a boat is not found in `db.boats`, the route falls back to `db.sold_boats`
- Sold boats render a different template: `boat_detail_sold.hbs`
- Sold boats have special SEO handling (meta robots tag changes to NOINDEX after 60 days)

### Image Featured Flag
- Images in `boatImages` array have a `featured` field (0 or 1)
- `getImages()` sorts images so featured images appear first
- The first image is typically used as the main product image

### Video Handling
- Videos can be stored in multiple fields:
  - `Video1`, `Video2`, `Video3`, `Video4` (direct URLs)
  - `video_url` (array of additional video URLs)
- YouTube URLs are converted to embed URLs
- YouTube thumbnails are generated via `ytThumb` helper
- Videos are injected into galleries after the first image

### See360 Viewer
- Requires `hullId` (HIN) or `Sales_force_Id` to load
- Fallback to static gallery if viewer fails
- 15-second timeout for viewer initialization
- Observer pattern detects viewer success/failure

### SEO & Schema
- Dynamic title and meta description based on boat data
- Product schema.org JSON-LD generated for rich snippets
- Schema toggles controlled via admin panel
- Image alt text dynamically generated from SEO metadata

### Form Submission
- Google reCAPTCHA v3 integration
- Honeypot field for spam protection
- UTM parameters tracked and submitted
- Phone formatting via Cleave.js
- Dealership location selection required

---

## 14. URLs Generated

### Boat Detail URLs
- Format: `/{type}-boats-for-sale-detail/{permalink}`
- Permalink format: `{year}-{make}-{model}-{salesforce_id}`
- Example: `/new-boats-for-sale-detail/2021-mastercraft-x24-a016A00000A0FCCQA3`

### Image URLs
- Stored as full URLs in `boatImages` array
- Can be absolute URLs (CDN) or relative paths
- No transformation in template (used as-is)

### Video URLs
- Stored as full URLs
- Converted to embed format for playback
- Thumbnail URLs generated via YouTube API pattern

---

## 15. Error Handling

### Boat Not Found
**File**: `routes/index.js`  
**Lines**: 805-820

If boat not found in both `boats` and `sold_boats` collections:
- Renders error template: `views/error.hbs`
- Message: "Boat not found"
- Returns 404 status

### See360 Viewer Failure
- Fallback to static gallery
- 15-second timeout
- Observer pattern for detection
- No user-facing error message

### Image Loading Failures
- No specific error handling in template
- Broken images show browser default alt text
- No fallback images defined

---

## End of Documentation
