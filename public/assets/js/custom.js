/**
 * custom.js
 * Copied from mean-idaho-master/public/assets/js/custom.js
 * Contains all boat listing page handlers:
 *   - window.applyView          (list/grid view toggle)
 *   - #boats-list opacity fix   (fade-in after 500ms)
 *   - .toggleViewBtn            (view persistence via localStorage)
 *   - Sort dropdown handlers    (uses refreshInventory() — AJAX, not form submit)
 *   - Desktop accordion         (.desktop-accordion-header)
 *   - Search box handlers       (keydown, keyup, submit guard, clear button)
 *   - Load More                 (moved to main.hbs inline script — see there)
 */

// ---------------------------------------------------------------------------
// applyView — globally available so inventory-results.js can call it
// Uses .boat-card (NOT .boat-card.list-view) so jQuery .show() doesn't
// override the display:flex set by CSS on .boat-card.
// ---------------------------------------------------------------------------
window.applyView = function (view) {
    if (view === 'list') {
        $('.boat-card').show();
        $('.grid-boat-card').hide();
        $('.grid-view-btn').removeClass('active');
        $('.list-view-btn').addClass('active');
    } else {
        $('.boat-card').hide();
        $('.grid-boat-card').show();
        $('.list-view-btn').removeClass('active');
        $('.grid-view-btn').addClass('active');
    }
    // Toggle white-btn / black-btn-sec icons on the view-toggle buttons
    $('.toggleViewBtn').each(function () {
        if ($(this).hasClass('active')) {
            $(this).find('.white-btn').show();
            $(this).find('.black-btn-sec').hide();
        } else {
            $(this).find('.white-btn').hide();
            $(this).find('.black-btn-sec').show();
        }
    });
};

// ---------------------------------------------------------------------------
// #boats-list fade-in — inventory-style.css sets opacity:0 on #boats-list
// so the first paint doesn't flash unstyled cards. After 500ms we reveal.
// ---------------------------------------------------------------------------
$(document).ready(function () {
    setTimeout(function () {
        $('#boats-list').css('opacity', 1);
    }, 500);
});

// ---------------------------------------------------------------------------
// View init on DOM ready + .toggleViewBtn click handler
// Defaults: desktop (≥992px) → list, mobile → grid
// ---------------------------------------------------------------------------
$(document).ready(function () {
    var currentView = localStorage.getItem('boatView') || ($(window).width() > 991 ? 'list' : 'grid');
    applyView(currentView);

    // Secondary call after 100ms handles cases where AJAX has just replaced
    // #boats-list content and the cards need the view applied again.
    setTimeout(function () {
        var view = localStorage.getItem('boatView') || 'list';
        window.applyView(view);
    }, 100);

    $('.toggleViewBtn').on('click', function () {
        if ($(this).hasClass('list-view-btn')) {
            currentView = 'list';
        } else {
            currentView = 'grid';
        }
        localStorage.setItem('boatView', currentView);
        applyView(currentView);
    });
});

// ---------------------------------------------------------------------------
// Sort dropdown — copied exactly from reference custom.js lines 681-688
// Sets sort_by hidden input then does a FULL FORM SUBMIT (page reload).
// This is intentional: reference repo uses form submit not AJAX for sort
// because sort order is stored in session and applied server-side.
// Both selects (#boat_search_filter in mobile sidebar,
//              #mobile-boat_search_filter in desktop listing header) trigger this.
// ---------------------------------------------------------------------------
$(document).on('change', '#boat_search_filter, #mobile-boat_search_filter', function () {
    $('input[name="sort_by"]').val(this.value);
    document.getElementById('boats_search_form').submit();
});

// ---------------------------------------------------------------------------
// Desktop filter accordion (.desktop-accordion-header)
// ---------------------------------------------------------------------------
$(document).ready(function () {
    $(document).on('click', '.desktop-accordion-header', function () {
        $(this).find('span.fa').toggleClass('fa-minus fa-plus');
        $(this).next('.filterList').slideToggle(200);
    });
});

// ---------------------------------------------------------------------------
// Mobile filter accordion (.filter-accordion-header)
// ---------------------------------------------------------------------------
$(document).on('click', '.filter-accordion-header', function () {
    $(this).next('.filter-accordion-content').slideToggle(200);
});

// ---------------------------------------------------------------------------
// Top-bar filter button → open matching sidebar panel
// ---------------------------------------------------------------------------
$(document).on('click', '.inner_wrap_bt a.opeN_clik', function () {
    var key = $(this).attr('title');
    if (!key || key === 'Sortby') return;
    // Desktop: slide down the matching filterList
    var $desktopPanel = $('.desktop_dis .filterOptions').filter(function () {
        return $(this).find('div[id="' + key + '-filter"], div[id="' + key + '-range"]').length > 0;
    });
    $desktopPanel.find('.filterList').slideDown(200);
    // Mobile: slide down the matching accordion content
    var $mobPanel = $('.sidWidget.af-disp-mob #' + key);
    if ($mobPanel.length) $mobPanel.find('.filter-accordion-content').slideDown(200);
    // Scroll the sidebar into view
    var $sidebar = $('.filtersWrapper');
    if ($sidebar.length) {
        $('html,body').animate({ scrollTop: $sidebar.offset().top - 20 }, 300);
    }
});

// ---------------------------------------------------------------------------
// Listing search box — Enter key navigates, dynamic clear icon, submit guard
// ---------------------------------------------------------------------------

// Enter → refresh inventory via AJAX (keeps filter state)
$(document).on('keypress', '.boat-search-listing', function (e) {
    if (e.which === 13) {
        e.preventDefault();
        $('#boat_name_val').val($(this).val());
        refreshInventory();
    }
});

// Dynamic clear (×) icon show/hide as user types
$(document).on('keyup input', '.boat-search-listing', function () {
    var val = $(this).val();
    var $container = $(this).closest('.lisitng-search-box');
    var $clearBtn  = $container.find('.clear-listing-search');
    if (val && val !== '0') {
        if ($clearBtn.length === 0) {
            $container.append(
                '<span class="fa fa-times clear-listing-search"' +
                ' style="position:absolute;right:10px;top:50%;transform:translateY(-50%);cursor:pointer;color:#a3a2a2;z-index:5;"></span>'
            );
        }
    } else {
        $clearBtn.remove();
    }
});

// Clear button click — wipe search and refresh
$(document).on('click', '.clear-listing-search', function () {
    $('.boat-search-listing').val('');
    $('#boat_name_val').val('');
    refreshInventory();
});

// Prevent form POST when the search input is focused (we handle via AJAX)
$(document).on('submit', '#boats_search_form', function (e) {
    if ($(document.activeElement).hasClass('boat-search-listing')) {
        e.preventDefault();
    }
});

// =============================================================================
// Boat Detail Page — all handlers below
// Copied from mean-idaho-master/public/assets/js/custom.js
// These only fire on pages that contain the relevant elements, so they are
// safe to load on every page.
// =============================================================================

// ---------------------------------------------------------------------------
// Owl Carousel — .boat-detail-carosuel (desktop image carousel)
// NOTE: Gallery is visible immediately so this first init measures full width.
// See360 only replaces the gallery after a successful spin; a 404 leaves this carousel as-is.
// ---------------------------------------------------------------------------
$(document).ready(function () {
    if ($('.boat-detail-carosuel').length) {
        $('.boat-detail-carosuel')
            .on('initialized.owl.carousel', function () {
                // Remove fancybox attr from cloned slides to prevent duplicate lightbox entries
                $(this).find('.cloned [data-fancybox="gallery-detail-carousel"]').removeAttr('data-fancybox');
            })
            .owlCarousel({
                loop: true,
                margin: 10,
                nav: true,
                responsive: {
                    0:    { items: 1 },
                    600:  { items: 1 },
                    1000: { items: 1 }
                }
            });
    }
});

// ---------------------------------------------------------------------------
// Slick Slider — .slider-for / .slider-nav (mobile thumbnail nav)
// ---------------------------------------------------------------------------
$(document).ready(function () {
    if ($('.slider-for').length && $('.slider-nav').length) {
        $('.slider-for').slick({
            slidesToShow:   1,
            slidesToScroll: 1,
            arrows:         false,
            fade:           true,
            asNavFor:       '.slider-nav'
        });
        $('.slider-nav').slick({
            slidesToShow:   3,
            slidesToScroll: 1,
            asNavFor:       '.slider-for',
            dots:           true,
            centerMode:     true,
            focusOnSelect:  true,
            responsive: [
                { breakpoint: 767, settings: { slidesToShow: 2 } },
                { breakpoint: 450, settings: { slidesToShow: 2 } }
            ]
        });
    }
});

// ---------------------------------------------------------------------------
// Fancybox — gallery on boat detail page
// ---------------------------------------------------------------------------
$(document).ready(function () {
    if (typeof $.fancybox !== 'undefined') {
        $.fancybox.defaults.hash = false;
        $('[data-fancybox="boatDetailFancyBox1"]').fancybox({
            buttons: ['zoom', 'share', 'slideShow', 'fullScreen', 'download', 'thumbs', 'close'],
        });
        $(window).off('popstate.fancybox');
    }
});

// ---------------------------------------------------------------------------
// MORE IMAGES toggle
// ---------------------------------------------------------------------------
// $(document).on('click', '#load_more_images', function () {
//     $('.image-second-sec').toggleClass('d-none');
//     $(this).text($(this).text().trim() === 'MORE IMAGES' ? 'LESS IMAGES' : 'MORE IMAGES');
// });
$(document).on('click', '#load_more_images', function (event) {
    $('.image-second-sec').toggleClass('d-none')
    const newText = $(this).text() === 'MORE IMAGES' ? 'LESS IMAGES' : 'MORE IMAGES';
    $(this).text(newText);
})

$("#toggleBtn").click(function () {
    const content = $(".accordion-desc");

    content.toggleClass("expanded");

    if (content.hasClass("expanded")) {
        $(this).text("READ LESS");
    } else {
        $(this).text("READ MORE");
    }
});
// ---------------------------------------------------------------------------
// Specs / Description / Features accordion
// ---------------------------------------------------------------------------
$(document).ready(function () {
    $(document).on('click', '.accordion-header.toggle-header', function () {
        if ($(this).find('span').hasClass('fa-plus')) {
            // Close all others first
            $('.custom-accordion').find('.fa-minus').removeClass('fa-minus').addClass('fa-plus');
            $('.custom-accordion').find('.specc-show').slideUp(400, function () {
                $(this).removeClass('specc-show');
            });
            // Open this one
            $(this).find('span').removeClass('fa-plus').addClass('fa-minus');
            $(this).next('.accordion-content').slideDown(400, function () {
                $(this).addClass('specc-show');
            });
        } else {
            $(this).find('span').removeClass('fa-minus').addClass('fa-plus');
            $(this).next('.accordion-content').slideUp(400, function () {
                $(this).removeClass('specc-show');
            });
        }
    });
});

// ---------------------------------------------------------------------------
// Financing Calculator Modal — open / close
// ---------------------------------------------------------------------------
$(document).on('click', '.opeen-calc', function () {
    var $modal = $('.custom-modal-box');
    $modal.css('display', 'block');
    setTimeout(function () { $modal.addClass('show'); }, 10);
});

$(document).on('click', '.close-modal', function () {
    var $modal = $('.custom-modal-box');
    $modal.removeClass('show');
    setTimeout(function () { $modal.css('display', 'none'); }, 500);
});

// ---------------------------------------------------------------------------
// Disclaimer dropdown toggle on boat detail
// ---------------------------------------------------------------------------
$(document).on('click', '.disclaimer-btn', function () {
    $(this).next('.disclaimer-content').slideToggle(200);
});
