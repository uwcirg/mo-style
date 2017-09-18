/*  ==================================================================

 Samurai CMS: Site-side

 Code conventions largely based on:
 http://javascript.crockford.com/code.html

 ==================================================================  */


var urlobj;
var cmsobj = {}; // MF (2012-08-23) TODO: migrate these to public properties of SamuraiCms object

$.hitch = function (ev, fn, scope) {
    return this.bind(ev, function () {
        return fn.apply(scope || this, Array.prototype.slice.call(arguments));
    });
};

// Must be in window scope for CKFinder to reach it.
//
// @todo 2015 migration: remove if not required
//function SamuraiCms_FinderConfig(){
//    var _this = finderConfigObj;
//}

// Must be in window scope for CKFinder to reach it.
function SamuraiCms_finderSelectCallback(url, width, height, alt) {
    document.getElementById(urlobj).value = url;

    $("#" + urlobj).change();

    // update preview
    if (url.search(".pdf") != -1) {
        $("#attachment_path").html("<a href=\"" + url + "\">" + url + "</a>");
    } else {
        $("#image_preview")
            .attr('src', url)
            .show();
    }

    oWindow = null;
}

mov.section.cms = ( function () {


    /*  ------------------
     Private properties
     ------------------  */
    var _debugging = false;
    var _cmsContentRoot = '#page';
    var _hoverTimeout = null;
    var _visible = false;
    var _$currentNinja = $();
    var _$currentCmsItem = $();
    var _$mostRecentCmsItem = $();
    var _mostRecentCmsItemCoords = {};
    var _$hoveredCmsItems = $();
    var _$hoveredCmsItemFrames = $();
    var _skippedItems = null;
    var _editableItems = null;

    var memberSearchFilters = { member_status: 4, locale: locale};

    var _cookieOptions = {
        path: '/',
        expires: null,
        domain: mov.vars.cookieDomain
    };
    var _mouseLeaveTimeoutMs = 333;
    var _actionLabels = {
        'add-child': 'Add child'
    };
    var _mousePos = {x: null, y: null};
    $(document).mousemove(function (e) { // set up a mouse monitor
        _mousePos.x = e.pageX;
        _mousePos.y = e.pageY;
    }).mouseover();

    // Decouple JS classes from CSS / server-side as much as possible
    var _id = {
        enableCheckbox: 'sm_chkEnable',
        pageLevelCmsItem: 'sm_cmsitem_page',
        skippedItemsDropdown: 'sm_ddlSkippedCmsitems',
        skippedItemsList: 'sm_skipped_cmsitems',
        skippedItemsListGlobal: 'sm_skipped_cmsitems_global',
        skippedCmsItemsLinkable: 'sm_skipped_cmsitems_linkable',
        enableAdvancedCheckboxContainer: 'sm_enable_advanced',
        enableAdvancedCheckbox: 'sm_chkEnableAdvanced',
        advancedSkippedCmsItems: 'sm_advanced_skipped_items',
        status: 'sm_status'
    };
    var _cls = {
        // SamuraiCms looks for these classes: use them in your markup
        // See _getCmsItemInfo(...) to find out what data attributes you will need to provide.
        cmsItem: 'sm-js-cmsitem',
        isLink: 'sm-js-cmsitem_linkable',

        // SamuraiCms adds these classes when required to indicate UI state
        // (They are purely cosmetic, except displayNone, which hides UI elements.)
        dropdownContainsPage: 'sm-contains-page',
        cmsItemCurrentFrame: 'sm-cmsitem-current-frame',
        cmsItemCurrent: 'sm-cmsitem-current',
        cmsItemParentOfCurrent: 'sm-cmsitem-parent-of-current',
        cmsItemParentOfCurrentFrame: 'sm-cmsitem-parent-of-current-frame',
        cmsItemHighlightFrame: 'sm-cmsitem-highlight-frame',
        cmsItemContainer: 'sm-cmsitem-container',
        cmsItemContainerFrame: 'sm-cmsitem-container-frame',
        displayNone: 'sm-dsn'
    };

    function _$id(lookup) {
        return $('#' + _id[lookup]);
    }

    function _$cls(lookup) {
        return $('.' + _cls[lookup]);
    }

    /*var _menubarsContainerSizeChanged = function() {
     $('#sm').css('padding-top', $('#sm_menubars_container').height() + 'px');
     if (typeof mov.ui != 'undefined' && $('#sm').length )
     mov.ui.updateLayout();
     }*/


    /*  -----------------
     Public properties
     -----------------  */

    var _locale = null;
    var cmsItemCssClass = _cls.cmsItem;
    var samuraiContainers = null; // Lock down the samurai editing to this parent

    function deleteTranslation(contentId, locale, originatingElement) {
        $.ajax({
            url: '/SamuraiCMS/edit/content_id/' + contentId + '/locale/' + locale + '/delete/Delete/',
            dataType: "html",
            data: {},
            beforeSend: function () {
                mov.helper.overlay.apply( originatingElement );
            },
            success: function (data) {
                $(originatingElement).html('Deleted');
                $(originatingElement).attr("onclick", "");
                $(originatingElement).removeClass("sm-action");
                _toggleSmSaveAsPanelVisibility(); // Close the sidebar
                _toggleSmSaveAsPanelVisibility(); // Re-open and reload sidebar
            },
            both: function () {
                mov.helper.overlay.clear( originatingElement );
            }
        });
    }

    function switchEdition(id) {
        $.ajax({
            url: '/SamuraiCMS/switch-edition/id/' + id,
            dataType: "html",
            data: {},
            success: function (data) {
                document.location = document.location;
            }
        });
    }

    function switchFunnel(link) {
        document.location = link;
    }

    /*  --------------
     Public methods
     --------------  */

    /**
     *
     * Initialization
     *
     */

    function init( l, samuraiVars) {
        _locale = locale;     // provided by site

        samuraiContainers = samuraiVars;

        if (_debugging && !console) {
            $("body").append('<div id="debug" style="text-align: left; position: fixed; left: 0; top: 0; z-index: 200000;"></div>');
        }

        // Update the 'Show Icon' checkbox...
        var cookieValue = $.cookie('samurai_edit');

        if (cookieValue == null || cookieValue == 'true') {
            $.cookie('samurai_edit', 'true', _cookieOptions);
            _visible = true;
            _$id('enableCheckbox').prop('checked', 'checked').parent('div').addClass('checked');
            if (_$id('advancedSkippedCmsItems').length) {
                _$id('enableAdvancedCheckboxContainer').show();
            } else {
                _$id('enableAdvancedCheckboxContainer').hide();
            }
        }

        _$id('enableCheckbox').change(
            function () {
                var _this = $(this);

                _setVisible( this.checked );
                if ( this.checked ) {
                    _this.parent('div').addClass('checked');
                }
                else {
                    _this.parent('div').removeClass('checked');
                }
                $.cookie('samurai_edit', this.checked, _cookieOptions);
            }
        );

        _$id('enableAdvancedCheckbox').removeAttr('checked');
        _$id('enableAdvancedCheckbox').change(
            function () {
                _$id('advancedSkippedCmsItems').toggle();
            }
        );

        // wire-up funnel dropdowns
        $('#sm_editions .sm-js-content').menubar({
            dropdownSelector: '.js-linked-dropdown',
            dropdownContentSelector: '.js-linked-dropdown-content'
        });


        // Set up the 3 different possible WYSIWYG types for Samurai.  Standard, Small and Email
        $('textarea.wysiwyg').ckeditor({
            customConfig: '/assets/vendor/custom/ck/ckeditor_config.js',
            height: '400px', width: '860px',
            on: {'instanceReady': configureHtmlOutput} // Convert RGB colours back to Hex etc
        });
        $('textarea.wysiwyg_small').ckeditor({
            customConfig: '/assets/vendor/custom/ck/ckeditor_config.js',
            height: '200px', width: '860px',
            on: {'instanceReady': configureHtmlOutput} // Convert RGB colours back to Hex etc
        });

        // Email wysiwygs often need to allow for full-HTML as well (normally ckeditor strips these out)
        // so include the docprops plugin
        $('textarea.wysiwyg_email').ckeditor({
            fullPage: true,
            removePlugins: 'autogrow',
            customConfig: '/assets/vendor/custom/ck/ckeditor_config.js',
            height: '400px', width: '860px',
            on: {'instanceReady': configureHtmlOutput} // Convert RGB colours back to Hex etc
        });


        // When in rome...
        // Disables html entities for Twig but we don't want docprops because we have a wrapping layout...
        $('textarea.wysiwyg_twig').ckeditor({
            customConfig: '/assets/vendor/custom/ck/ckeditor_config.js',
            fullPage: true,
            height: '400px', width: '860px',
            entities: false,
            removePlugins: 'autogrow',
            on: {'instanceReady': configureHtmlOutput} // Convert RGB colours back to Hex etc
        });

        // Integrate CKFinder with all CKEditor instances
        CKFinder.setupCKEditor(null, '/assets/vendor/custom/ck/ckfinder/');

        // Bind window scrolling so if it's >(height of first toolbar), it becomes position:fixed
        /*$(window).scroll(function(){
         if($(window).scrollTop() > $('#sm_menubars_container').height() ){
         $('#editingToolbar').addClass('scrolled');
         $('#sm_menubars_container').addClass('scrolled');
         }
         else{
         $('#editingToolbar').removeClass('scrolled');
         $('#sm_menubars_container').removeClass('scrolled');
         }
         });*/

        //_menubarsContainerSizeChanged();

        // --------- Let all other modules know that the samurai is active --------- //

        $(document.body).addClass('sm-active');
        mov.helper.broadcast.trigger('samurai-active');

        // --------- Make sure that, at every change in the page's content, all samurais are refreshed --------- //

        var _preventSamuraiRefresh = false; // This var is needed in order to limit the frequency of samurai's refreshes
        // Attach the samurai refresh at every dom modification:
        mov.helper.stash.$body.on("DOMSubtreeModified", function(){
            if(_preventSamuraiRefresh){ return; }
            _preventSamuraiRefresh = true;
            // Fire the refresh only after few seconds the DOM changed (this prevents the refresh to be fired too frequently)
            setTimeout(function(){
                mov.section.cms.refreshSamurai();
                $('.' + _cls.cmsItem).samurize();
                _preventSamuraiRefresh = false;
            }, 1500);
        });

        // --------- Bind actions to buttons, forms and side-bars --------- //

        // Bind actions to the right sidebar:
        $('#sm_editing-cancel-btn').click(mov.helper.modal.closeCurrent); // Cancel button: hides the current modal
        $('#sm_editing-save-as-btn').click(_toggleSmSaveAsPanelVisibility); // Save-as button: toggle lateral panel visibility
        $('#sm_editing-save-as-panel--close-panel-btn').click(_toggleSmSaveAsPanelVisibility); // Save-as button: toggle lateral panel visibility
        _saveAsPanelHandler();

        // Bind the RHS Samurai Toolbar "save" button
        $('#sm_editing-save-btn').click(saveTranslation);

        // Bind the Search form within the LHS Samurai Toolbar "log me in as Member ID" tab
        $("form#member-search--form").submit( function(e){

            // Only submit the visible normal elements plus any "hidden" type elements
            var data = $(':input:visible,input[type=hidden]', this).serialize();

            // Do the search, which will inject the results into the $searchMemberByIdResults container
            searchMembers( data, $("#member-search--search-container"), $("#member-search--results") );

            return false;
        });

        $("select#member-search-locale").change( function() {
            var value = $(this).val();
            var $dollarBits = $("div.member-search-amount-raised_currency-symbol i");

            var dollarClass = "fa-dollar";

            if( value == "en_GB" ) {
                dollarClass = "fa-gbp";
            }
            else if( $.inArray( value, ["en_AU","en_ZA","en_NZ","en_US","en_CA","fr_CA","en_SG","en_HK"] ) < 0 ) {
                dollarClass = "fa-euro";
            }

            $dollarBits.removeClass().addClass("fa "+dollarClass);
        });

        // --------- Refresh all Samurai --------- //
        // (This first lunch is used to initialize them)
        mov.section.cms.refreshSamurai();
        $('.' + _cls.cmsItem).samurize();

        // --------- Misc stuff --------- //

        // If we use CKeditor a bug happens when a modal is opened, because the keyboard focus is trapped inside the modal and cannot focus on elements outside of it (CKeditor fields)
        // Therefore, whenever a modal is opened, the tabindex must be reset (however keep the tabindex for the livesite because it is important for accessibility!)
        mov.helper.broadcast.on('modal-shown', function(){
            document.getElementById('mo-default-modal').setAttribute('tabindex','');
        });

        $.fn.modal.Constructor.prototype.enforceFocus = function() {}; // firefox needs this snippet to allow the input to be editable

    }

    /**
     *
     * When in admin mode, this can be called to re-initialise Samurai to include elements added dynamically
     *
     */
    function refreshSamurai() {

        if (typeof mov.vars.adminUrl === "undefined") { return; }

        _$cls('cmsItem').each(function () {
            initElement(this);
        });
        
    }

    /**
     * Perform a Member Search via the SamuraiCMS Toolbar "log me in as" tabs
     *
     * @param container  The parent container of the tab
     * @param $resultsContainer  The container we want to inject the results into
     * @param data  Search parameters
     * @param url   The URL to load (can be left empty to use default samurai search-members calls)
     */
    function searchMembers( data, $container, $resultsContainer, url ) {
        mov.helper.overlay.apply( $container );

        if( typeof url == "undefined" ) {
            url = baseUrl + 'SamuraiCMS/search-members/';
        }

        $.ajax({
            type: "GET",
            url: url,
            data: data,
            cache: false
        }).done(function (response) {
            // Display the results
            $resultsContainer.show().html(response);

            // Bind the "log me in as" buttons, to log us in as the requested member and refresh the page
            $resultsContainer.find(".sm-toolbar-member-results-login-button").click( function(e) {
                e.preventDefault();

                loginAs( {id: $(this).data("member-id") } );
            });

            // Bind any pagination links to happen via AJAX instead of page loads
            $resultsContainer.find("nav").find("a").click(function (e) {
                var url = $(this).attr('href');
                e.preventDefault();

                searchMembers( data, $container, $resultsContainer, url );
            });

        }).always(function () {
            mov.helper.overlay.clear( $container );
        });
    }

    /**
     *
     * el:
     * parentEl: If this is an element, SamuraiCMS will only apply to children within it.
     *           This can be used to only make part of a page Samurai-able
     */
    function initElement(el) {
        // samurize() jQuery plugin (below) calls this to make an element editable
        var $el = $(el);

        // Do not re-apply
        if ($el.data('cmsItem'))
            return;

        var cmsItem = _getCmsItemInfo($el);
        if (!cmsItem) { // apparently we couldn't get hold of any cmsItemInfo
            return;
        }
        $el.data('cmsItem', cmsItem);

        // Ignore this element altogether if this is specified in its attributes
        if (cmsItem.ignoreMe)
            return;

        // If we have set "parent" containers for SamuraiCMS, we should ignore any 
        // elements which fall outside of these containers.
        if (samuraiContainers && !$el.parents().filter(samuraiContainers).length) {
            // Remove any cmsitem'y classes from elements which aren't enabled for SamuraiCMS
            $el.removeClass('sm-js-cmsitem')
                .removeClass('sm-js-cmsitem_editable')
                .removeClass('sm-js-cmsitem_linkable');
            return;
        }
        if (typeof $(mov.vars.samuraiContainerBlockSelector) != "undefined" && $(mov.vars.samuraiContainerBlockSelector) && $el.parents().filter($(mov.vars.samuraiContainerBlockSelector)).length) {
            // Remove any cmsitem'y classes from elements which aren't enabled for SamuraiCMS
            $el.removeClass('sm-js-cmsitem')
                .removeClass('sm-js-cmsitem_editable')
                .removeClass('sm-js-cmsitem_linkable');
            return;
        }

        // Turn "page" linkable into special addSkipped-style entry
        if (cmsItem.isPage) {
            _$id('skippedItemsDropdown').addClass(_cls.dropdownContainsPage);
            _$id('skippedCmsItemsLinkable')
                .html('Content on this page is drawn from: ')
                .append($(
                    '<a ' +
                    'href="' + cmsItem.href + '" ' +
                    'title="Samurai Admin - Edit ' + cmsItem.type + " #" + cmsItem.id + '" ' +
                    'target="_blank">' +
                    cmsItem.type + ' #' + cmsItem.id +
                    '</a>'
                ));
            $el.remove();
            return;
        }

        // Wire-up cms item
        $el.mouseenter(_cmsItem_onMouseEnter);
        $el.mouseleave(_cmsItem_onMouseLeave);

        // Give item-list items (containers) a special appearance
        if (cmsItem.actions['add-child']) {
            $el.addClass(_cls.cmsItemContainer);
        }

        // Ensure inline elements highlight like a box (not like a set of line-boxes)
        if (_getComputedStyle($el[0], 'display') == 'inline') {
            var hasChildren = $el.children().length != 0;
            
            var message_id = $el.attr('message_id');

            var hasBlockChildren = hasChildren && _getComputedStyle($el.children()[0], 'display') == 'block' && $el.children()[0].tagName.toLowerCase() != 'img';

            // Need "inline-block" instead of "black" for display, if the element contains other block elements (except images), and we also don't worry about WYSIYWG snippet types
            var disp = ( hasBlockChildren || _displayCmsItemAsBlock( cmsItem ) ) ? 'block' : 'inline-block';

            if (hasChildren) {
                // Sections commented out to fix MOV2360-28 - underline missing from login
                $el.css({
                    'display': disp,
                    //'display': 'block' ,
                    'zoom': 1,
                    'text-indent': 0
                });
            }
        }
    }


    /**
     * Certain CMS elements don't display correctly as inline-block.
     *
     * @param cmsItem
     * @returns {boolean}
     * @private
     */
    function _displayCmsItemAsBlock( cmsItem )
    {
        var blockItems = [
            'soundcloud',
            'heroimage',
            'featureheader',
            'featuresection',
            'highlightbox',
            'popoverset',
            'featuresnippet'
        ];

        return blockItems.indexOf( cmsItem.type ) != -1;
    }


    /**
     * Prompt to reload page to update element
     */

    function promptUpdateElement(messageId, contentType, data, saved_locale) {

        if (contentType != 'text' && contentType != 'snippet') {
            if (confirm('Reload page to see changes?')) {
                document.location = document.location;
            }
        } else {
            _debug(saved_locale);
            _debug(_locale);
            /* Place the new content within the element, 
             * unless it was saved to a different locale */
            if (saved_locale == _locale)
                $("span[message_id='" + messageId + "']").html(data.content);
        }

        // Trigger an event we can detect elsewhere
        $("span[message_id='" + messageId + "']").trigger('content_update', data.content);
    }

    function setSkippedItems(items) {
        _skippedItems = items;
    }

    function setEditableItems(items) {
        _editableItems = items;
    }

    /* sh: added the 'skipped' param, to detect these items being edited and place them in a x/y */
    function renderSkippedItems() {

        for (var x in _skippedItems) {

            // Show limited number at a time:
            var messageId = _skippedItems[x].messageId;
            var isGlobal = false;
            if (_skippedItems[x].itemContent && _skippedItems[x].itemContext['global'])
                isGlobal = _skippedItems[x].itemContext['global'];
            var href = '/SamuraiCMS/edit/content_id/' + messageId + '/locale/' + _locale + '/?skipped=true';
            var $whereToPutIt = isGlobal ? _$id('skippedItemsListGlobal') : _$id('skippedItemsList')
            $whereToPutIt.append(
                '<li>' +
                '<a message_id="' + messageId + '" data-id="' + messageId + '" href="' + href + '">' +
                messageId +
                '</a>' +
                '</li>'
            );

        }

        _$id('skippedItemsListGlobal').add(_$id('skippedItemsList')).find('a').click(function (e) {
            e.preventDefault();
            mov.helper.modal.loadUrl($(this).attr('href'), {
                title: 'Editing: ' + messageId,
                onSuccess: function () {
                    //mov.section.cms.initDialog(); // Removed by Franco on 16-03-2015

                    // Removed by DM: June 2015.  This stuff already gets kicked off when the herotile editor is loaded (SamuraiCMS/IndexController->editAction)
                    //mov.section.cms.initInlineEditor();
                    //_enterEditingMode();
                },
                onHidden: _exitEditingMode
            });
        });

        // Adding of 'Global' title
        if (isGlobal) {
            var html = '<div class="globalTitle"><strong>Global <i>&#x25B2;</i></strong></div>';
            $whereToPutIt.before($(html).bind('click', function () {
                var _title = $(this);
                if (_title.data('open') != true) {
                    _title.addClass('open').data('open', true).next('ul').hide().end().find('i').html('&#x25Bc');
                }
                else {
                    _title.removeClass('open').data('open', false).next('ul').show().end().find('i').html('&#x25B2');
                }
            }));
        }

    }


    /*  BELOW ARE FUNCTIONS FOR SELECTING A IMAGE VIA FCKBrowser */


    /**
     * This will load up a CKFinder window, defaulting it to the base "Images" folder
     */
    function selectImage(obj, folder) {
        urlobj = obj;

        if (folder == undefined) {
            folder = '/';
        }

        var finder = new CKFinder();
        finder.basePath = '/assets/vendor/custom/ck/ckfinder/';	// The path for the installation of CKFinder (default = "/ckfinder/").
        finder.startupPath = "Images:" + folder;
        finder.startupFolderExpanded = true;
        finder.selectActionData = obj;
        finder.selectActionFunction = SamuraiCms_finderSelectCallback;
        finder.popup();
    }


    /**
     * This will load up a CKFinder window, defaulting it to the base "Files" folder
     */
    function selectFile(obj, folder) {
        urlobj = obj;

        if (folder == undefined) {
            folder = '';
        }

        var finder = new CKFinder();
        finder.basePath = '/assets/vendor/custom/ck/ckfinder/';	// The path for the installation of CKFinder (default = "/ckfinder/").
        finder.startupPath = "Files:" + folder;
        finder.startupFolderExpanded = true;
        finder.selectActionData = obj;
        finder.selectActionFunction = SamuraiCms_finderSelectCallback;
        finder.popup();

    }


    function updateYouTubePreview(event) {
        $("#samurai-youtube-preview").attr('src', 'https://www.youtube.com/v/' + $(event).val());
    }


    function updateVideoPreview(event) {
        if (event.name == 'youtube_id') {
            $('#memelabs-preview-wrapper').hide();
            $("#samurai-youtube-preview").attr('src', 'https://www.youtube.com/v/' + $(event).val());
            $("#youtube-preview-wrapper").show();

        } else if (event.name == 'memelabs_id') {
            $("#youtube-preview-wrapper").hide();
            $('#samurai-memelabs-preview').attr('flashvars', 'stretching=fit&amp;skin=http://memelabs.com/movember/_swf/meme-player-skin.swf&amp;xmlFile=read-xml/mediaId/&amp;homeURL=http://memelabs.com/movember/media-player2/&amp;mediaId=' + $(event).val() + '&amp;videoWidth=250&amp;videoHeight=187');
            $("#samurai-memelabs-preview").attr('src', 'https://memelabs.com//_contestassets/_swf/meme-player.swf?mediaId=' + $(event).val() + '&amp;homeURL=http://memelabs.com/movember/media-player2/" type="application/x-shockwave-flash');
            $('#memelabs-preview-wrapper').show();
        }
    }


    // bind panels to be opened
    $('#sm_menubars').delegate('.sm-js-label', 'click', function () {
        if (!cmsobj.editingmode) {
            var $this = $(this);
            var _sm_status = 'sm_menubarsStatus';

            if ($this.data(_sm_status) !== true) {
                if (cmsobj.smopen == true) {
                    $('#sm_menubars').find('.sm-js-label').each(function () {
                        $(this).removeClass('open').data(_sm_status, false).next('.sm-js-content').removeClass('active');
                    });
                    $this.addClass('open').data(_sm_status, true).next('.sm-js-content').addClass('active');
                }
                else {
                    var d_width = $(document).width();
                    var d_height = $(document).height();
                    $('#sm').after($('<div id="sm_overlay" style="width:' + d_width + 'px; height:' + d_height + 'px;"></div>').bind('click', function (e) {
                        // should close all
                        $('#sm_menubars').find('.sm-js-label').each(function () {
                            $(this).removeClass('open').data(_sm_status, false).next('.sm-js-content').removeClass('active');
                        });
                        cmsobj.smopen = false;
                        $('#sm_overlay').remove();
                    }));
                    $this.addClass('open').data(_sm_status, true).next('.sm-js-content').addClass('active');

                    cmsobj.smopen = true;
                }
                $('.sm-layout-lcr-centre a').click(function () {
                    mov.section.cms.close_sm_overlay($this, _sm_status);
                });
            }
            else {
                mov.section.cms.close_sm_overlay($this, _sm_status);
            }
        }

    });

    // bind panels to be closed by inner close buttons (note, this button should be placed right inside the container ".sm-js-content")
    $('#sm_menubars').find('.sm-js-content').delegate('.sm-js-content-close-btn', 'click', function () {
        mov.section.cms.close_sm_overlay($(this).parent().siblings('.sm-js-label'), 'sm_menubarsStatus');
    });

    $('#sm_menubars').delegate('.sm-layout-lcr-centre', 'click', function (e) {
        var _sm_status = 'sm_menubarsStatus';

        if (!cmsobj.editingmode) {
            if (this == e.target) {
                $('#sm_menubars').find('.sm-js-label').each(function () {
                    $(this).removeClass('open').data(_sm_status, false).next('.sm-js-content').removeClass('active');
                });
                cmsobj.smopen = false;
                $('#sm_overlay').remove();
            }
        }
    });

    function close_sm_overlay($labelObj, _sm_status) {
        cmsobj.smopen = false;
        $labelObj.removeClass('open').data(_sm_status, false).next('.sm-js-content').removeClass('active');
        $('#sm_overlay').remove();
    }

    function changeValue(value, _selectID) {
        var elementType = 'input'; // elementTYpe by default

        $('#' + _selectID).find('select').val(value);

        // Check which sort of element we are dealing with
        if ($('#input-editor').size() == true)
            elementType = 'input';
        else if ($('#link-editor').size() == true)
            elementType = 'link';
        else if ($('#ckedit').size() == true)
            elementType = 'iframe';
        
        retrieveHistory(value, elementType);
    }


    /**
     * Retrieves JSON data containing the history of edits for the current item
     *
     * @param callback
     * @private
     */
    function _getRawHistory( callback, orderBy ) {
        if( !mov.section.cms.hasOwnProperty('currentMessageId') ){
            console.warn('unable to load the message_id to get the associated history');
        }

        $.ajax({
            url: baseUrl + 'SamuraiCMS/get-sidebar-history/',
            dataType: "json",
            data: {
                id: mov.section.cms.currentMessageId,
                _locale: _locale.toString(),
                orderBy: orderBy
            },
            success: function(jsonObj) {
                if (!jsonObj){
                    alert('There was an error retrieving the history');
                    return;
                }

                mov.section.cms.currentHistory = jsonObj;

                if( typeof callback == "function" ){
                    callback( jsonObj );
                }
            }
        });
    }


    // This function will populate the content box with the content 
    // associated with a history item in the menu. Previously loaded and saved.
    function retrieveHistory(id, elementType) {
        _debug('updating ' + elementType + ' with id: ' + id);

        $.ajax({
            url: baseUrl + 'SamuraiCMS/get-history/',
            dataType: "json",
            data: {id: id, _locale: _locale.toString()},
            beforeSend: function () {
                mov.helper.overlay.showGlobalLoading();
            },
            success: function (jsonObj) {

                mov.helper.overlay.hideGlobalLoading();
                if (!jsonObj)
                    alert('There was an error retrieving the history');
                else {
                    if (jsonObj.content ) {

                        /**
                         * MODEV-1239 We can now pass through some data to do this a but smarter
                         */
                        if( jsonObj.elements ){
                            var $form = $('.zend_form');

                            $.each( jsonObj.elements, function( key, element ){
                                var $element = $form.find('#' + element);

                                if( $element.length ){

                                    /** Careful of checkboxes **/
                                    if( $element[0].type == 'checkbox' ){
                                        $element[0].checked = parseInt( jsonObj.content[key] );
                                    } else {
                                        $element.val( jsonObj.content[key] );
                                    }
                                }
                            });

                            /**
                             * If we have colour pickers in the edit form, reload to make it match the new value
                             */
                            $form.find('input[type="color"]').each( function(){
                                var $this = $(this);

                                var inputId = $this.attr('id').replace('picker_', '');
                                var value = $('#' + inputId).val();

                                $this.val( value );
                            });

                            return;
                        }

                        if (elementType == 'link') {
                            // Note: moved unserialisation back to backend...
                            var content = jsonObj.content;
                            _debug(content);

                            // Full link types are objects, images are strings...
                            if (typeof(content) == 'object') {

                                if (content.src) { // footer flash .swf
                                    $('.zend_form').find('input#content_image_reference').val(content.src);
                                } else if (content.delay) { // HeroTile
                                    _debug('herotile');

                                    $.each(content, function (index, value) {
                                        $('.zend_form input#content_' + index).val(value);
                                    });

                                    /* So for HeroTile, the form fields do not match the JSON fields entirely...
                                     content_image_reference = imgsrc
                                     content_image_link = link
                                     */

                                    $('.zend_form input#content_image_link').val(content.link);
                                    $('.zend_form input#content_image_reference').val(content.imgsrc);

                                    // We also want to take the oppertunity to update the image now...
                                    // not on the hover event like images
                                    $('img#image_preview').attr('src', baseUrl + content.imgsrc);

                                } else {
                                    $.each(content, function (index, value) {
                                        $('.zend_form input#content_' + index).val(value);
                                    });

                                    if( content.imgsrc ) {
                                        $('.zend_form input#content_image_reference').val(content.imgsrc);
                                        $('img#image_preview').attr('src', baseUrl + content.imgsrc);
                                    }
                                    if( content.link ) {
                                        $('.zend_form input#content_image_link').val(content.link);
                                    }

                                }
                            } else if (typeof(content) == 'string') {
                                _debug(content);
                                $('.zend_form').find('input#content_image_reference').val(content);
                            }
                        }
                        else if (elementType == 'input')
                            $('.zend_form').find('input#content').val(jsonObj.content);
                        else {
                            $('.zend_form').find('iframe').contents().find('body').empty();
                            $('.zend_form').find('iframe').contents().find('body').append(jsonObj.content);

                            // Resize the dialog for the new content
                            var contentHeight = $('.cke_contents').find('iframe').contents().height();
                            // $('#ckedit').dialog("option", "height", contentHeight + 60 ); // Removed by Franco on 16-03-2015
                            $('table.cke_editor').css('height', contentHeight + 'px');
                        }
                    }
                    else
                        alert("Error retrieving history");

                }
            }
        });
    }

    function logoutAdmin() {
        $.ajax({
            url: baseUrl + 'SamuraiCMSlogout/',
            dataType: "json",
            success: function (data) {
                if (!data)
                    alert('There was an error logging in');
                else {
                    if (data.result) {
//                        alert("Logged in: " + data.id);
                        document.location = document.location;
                    }
                    else {
                        alert("Error logging in: " + data.error);
                    }
                }
            }
        });
    }

    function populateTranslations() {

        var _translations = $('#sm_translations_list');

        if (_translations.find('li').length > 0) {

            var html = '<div class="edit-tab js-edit-tab" id="edit-more">' +
                '<div class="edit-label">Translations</div>' +
                '<div class="edit-content js-edit-content"><ul>' +
                _translations.html() +
                '</ul></div>' +
                '</div>';
            $('#editingToolbar').append(html);
        }

        // Make it scroll
        makeScrollable($('#edit-more .edit-content'), 12);

    }

    function populateLocale() {

        var $locale = $('#samuraiCMSeditContentForm #locale');
        var html = '<div class="edit-tab js-edit-tab" id="edit-save">' +
            '<div class="edit-label">Save as</div>' +
            '<div class="edit-content js-edit-content">';
        $locale.children('optgroup').each(function () {
            html += '<div class="edit-acc">';
            html += '<div class="edit-acc-label">' + $(this).attr('label') + '</div>';
            html += '<div class="edit-acc-content"><ul>';

            $(this).children('option').each(function (i) {
                html += '<li onclick="mov.section.cms.saveContent(\'' + $(this).val() + '\');">' + $(this).text() + '</li>';
            });

            html += '</ul></div></div>';
        });

        html += '</div></div>';

        // Add in CKEditor Toolbar empty div in case we want to fix editor toolbars here
        html += '<div id="ckeditor_toolbar"></div>';

        $('#editingToolbar').append(html);

        makeScrollable($('#edit-save .edit-content .edit-acc-content'), 16);
    }

    /**
     * Make a list within a menu scrollable
     */
    function makeScrollable(element, numItemsToDisplay) {

        var scroll_down_div = '<div class="scroll" id="down">&nbsp;<div>';
        var scroll_up_div = '<div class="scroll disabled" id="up">&nbsp;<div>'; // Up disabled by default

        $(element).find('ul').each(function () {
            $(this).data('maxItems', numItemsToDisplay);

            if ($(this).children('li').length > numItemsToDisplay) {

                $(this).children('li').each(function (i, e) {
                    if (i > numItemsToDisplay)
                        $(e).hide();
                });

                // Scroll functionality tied to these divs...
                $(this).append(scroll_down_div);
                $(this).prepend(scroll_up_div)
            }
        });
    }

    /* Not pretty: Scrolls the menu items...TODO: make nicer. */
    function startScroll(el) {

        var list = $(el).parent('ul');

        if ($(el).attr('id') == 'down') {

            list.children('div.scroll#up').removeClass('disabled');

            // find the last visible item and show the next
            if (!list.children('li:visible:last').next().hasClass('scroll')) {
                list.children('li:visible:last').next().show();
                list.children('li:visible:first').hide();
            } else {
                list.children('div.scroll#down').addClass('disabled');
            }

        }
        else if ($(el).attr('id') == 'up') {

            list.children('div.scroll#down').removeClass('disabled');

            // find the first visible item and show the previous
            if (!list.children('li:visible:first').prev().hasClass('scroll')) {
                list.children('li:visible:first').prev().show();
                list.children('li:visible:last').hide();
            } else {
                list.children('div.scroll#up').addClass('disabled');
            }
        }
    }

    function skipToEnd(el) {

        var list = $(el).parent('ul');
        var numItems = list.data('maxItems');

        console.log(numItems);

        if ($(el).attr('id') == 'down') {

            list.children('div.scroll#up').removeClass('disabled');
            if (!list.children('li:visible:last').next().hasClass('scroll')) {
                // Show the last items according to menu maxItems set
                var lastItem = list.children('li:hidden:last');

                list.children('li').slice(lastItem.index, lastItem.index - numItems).show();
            }
        }
        else if ($(el).attr('id') == 'up') {

            list.children('div.scroll#down').removeClass('disabled');
            if (!list.children('li:visible:first').prev().hasClass('scroll')) {
                var firstItem = list.children('li:hidden:first');
                console.log(list.index(firstItem));
                list.children('li').slice(firstItem.index, firstItem.index + numItems).show();
            }
        }

        clearInterval(list.children('div.scroll').data('scroll'));
    }

    /**
     * Menu scrolling mouse events
     */
    $('div.scroll').on('mouseenter', function () {

        var el = $(this);
        $(this).data('scroll', setInterval(function () {
                mov.section.cms.startScroll(el);
            }, 150)
        );

    });

    /**
     * Menu scrolling mouse events
     */
    $('div.scroll').on('mouseleave', function () {
        clearInterval($(this).data('scroll'));
    });

    // Go to the beginning / end of list on double click
    $('div.scroll').on('dblclick', function () {
        var el = $(this);
        mov.section.cms.skipToEnd(el);
    });

    /**
     * For the given locale/s, grab translation data from the main SamuraiCMS edit form that should be currently displayed,
     * and send it to the Translation API to publish new translations
     *
     * @param locale string|array This can be a single locale or an array of locales. (ie. "en_AU" or ["en_AU","en"])
     */
    function saveContent(locale) {
        mov.helper.overlay.apply( _$smSaveAsPanel );

        var $form = $('#samuraiCMSeditContentForm');
        var translationData = {};

        // Convert the form data into an array
        $form.serializeArray().map(function(x){translationData[x.name] = x.value;});
        translationData.locale = locale;

        $.ajax({
            type: "POST",
            url: mov.vars.baseUrlApi + "translate",
            data: JSON.stringify(translationData),
            dataType: "json",
            cache: false
        }).done(function (response) {
            if( response.success ) {

                // Show a temporary message
                $.each( response.locales, function( locale, data ) {
                    if( data.error ) {
                        $("td[data-locale='"+locale+"']").html(data.error);
                    } else {
                        $("td[data-locale='"+locale+"']").html('Updated');
                    }
                });

                var $historyContent = $('#sm_editing-save-as-panel').find('tbody.versioning-content');
                var historyHtml;

                // Refresh the panel...
                _getRawHistory( function( data ){
                    var _$smSaveAsPanel = $('#sm_editing-save-as-panel');
                    historyHtml = _buildPublishedHistory( data );

                    $historyContent.html( historyHtml );
                    mov.helper.overlay.clear( _$smSaveAsPanel );
                });
            }
        }).always(function () {
//            mov.helper.overlay.clear( _$smSaveAsPanelSaveBtn );
        });
    }

    function reloadHistory( orderBy ) {
        var $historyContent = $('#sm_editing-save-as-panel').find('tbody.versioning-content');
        var historyHtml;
        var _$smSaveAsPanel = $('#sm_editing-save-as-panel');
        
        mov.helper.overlay.apply( _$smSaveAsPanel );

        // Refresh the panel...
        _getRawHistory( function( data ){
            var _$smSaveAsPanel = $('#sm_editing-save-as-panel');
            historyHtml = _buildPublishedHistory( data );

            $historyContent.html( historyHtml );
            mov.helper.overlay.clear( _$smSaveAsPanel );
        }, orderBy );

    }
    /**
     * For the given locale/s, grab the Samurai MessageID from the main SamuraiCMS edit form that should be currently displayed,
     * and send it to the Translation API to unpublish translations
     *
     * @param locale string|array This can be a single locale or an array of locales. (ie. "en_AU" or ["en_AU","en"])
     */
    function deleteContent(locale, originatingElement ) {
        mov.helper.overlay.apply( _$smSaveAsPanel );

        var $form = $('#samuraiCMSeditContentForm');
        var translationData = {};

        // Convert the form data into an array
        $form.serializeArray().map(function(x){translationData[x.name] = x.value;});
        translationData.locale = locale;

        $.ajax({
            type: "DELETE",
            url: mov.vars.baseUrlApi + "translate/" + translationData.content_id,
            data: JSON.stringify(translationData),
            dataType: "json",
            cache: false
        }).done(function (response) {
            if( typeof response.success !== "undefined" ) {

                // Show a temporary message
                $.each( response.locales, function( locale, data ) {
                    if( data.error ) {
                        $("td[data-locale='"+locale+"']").html(data.error);
                    } else {
                        $("td[data-locale='"+locale+"']").html('Deleted');
                    }
                });

                // Refresh the panel...
                var $historyContent = $('#sm_editing-save-as-panel').find('tbody.versioning-content');
                var historyHtml;

                // Refresh the panel... currently by hiding/showing it. must be a better way
                _getRawHistory( function( data ){
                    var _$smSaveAsPanel = $('#sm_editing-save-as-panel');
                    historyHtml = _buildPublishedHistory( data );

                    $historyContent.html( historyHtml );
                    mov.helper.overlay.clear( _$smSaveAsPanel );
                });
            }
        }).always(function () {
        });
    }

    function bindEditDropdowns() {
        $('#editingToolbar').menubar({
            dropdownSelector: '.js-edit-tab',
            dropdownContentSelector: '.js-edit-content'
        });
    }

    $.fn.menubar = function (overrides) {
        if (typeof cmsobj.menubars === 'undefined')
            cmsobj.menubars = [];

        var o = {
            dropdownSelector: '.js-linked-dropdown',
            dropdownContentSelector: '.js-linked-dropdown-content',
            openCssClass: 'open',
            autohideTimeout: 500 // milliseconds
        };
        $.extend(o, overrides);

        $(this).each(function () {
            // menubars contain linked dropdowns
            var $menubar = $(this);
            cmsobj.menubars.push($menubar);

            $menubar
                .data('config', o) // persist menubar config data
                .delegate(o.dropdownSelector, 'click mouseenter', function (e) {
                    var $this = $(this); // is a container of label-and-content (a.k.a top-level menu item / dropdown)
                    if (e.type == 'click') {
                        if ($this.data('edit-open') !== true) {
                            if (cmsobj.$activeMenubar) {

                                $menubar.find(o.dropdownSelector).each(function () {
                                    $(this)
                                        .data('edit-open', false)
                                        .removeClass(o.openCssClass)
                                        .children(o.dropdownContentSelector)
                                        .hide();
                                });

                                $this

                                    .data('edit-open', true)
                                    .addClass(o.openCssClass)
                                    .children(o.dropdownContentSelector)
                                    .show();
                            } else {
                                $this
                                    .data('edit-open', true)
                                    .addClass(o.openCssClass)
                                    .children(o.dropdownContentSelector)
                                    .show();
                                cmsobj.$activeMenubar = $menubar;

                            }
                        } else {
                            // collapses subheading contents...
//                            if ( $(e.target).hasClass('edit-acc-label')  ){
//                                
//                                 $(e.target)
//                                    .toggleClass('collapsed')
//                                    .next('.edit-acc-content')
//                                        .toggle();
//                                return;
//                            }

//                            _debug('closing...');

                            if ($(e.target).hasClass('scroll'))
                                return;

                            mov.section.cms.closeMenubarDropdowns();
                        }
                    }

                    else if (e.type == 'mouseenter') {
                        if (cmsobj.$activeMenubar) {
                            // close all panel, and open $this, after 1.5 seconds
                            $menubar.find(o.dropdownSelector).each(function () {
                                $(this)
                                    .data('edit-open', false)
                                    .removeClass(o.openCssClass)
                                    .children(o.dropdownContentSelector)
                                    .hide();
                            });

                            $this
                                .data('edit-open', true)
                                .addClass(o.openCssClass)
                                .children(o.dropdownContentSelector)
                                .show();
                        }
                    }
                })
                .bind('mouseleave', function () {
                    if (cmsobj.$activeMenubar) {
                        var $this = $(this);

                        cmsobj.$activeMenubar.data(
                            'autohideTimer',
                            setTimeout(function () {
                                    $menubar.find(o.dropdownSelector).each(function () {
                                        $(this)
                                            .data('edit-open', false)
                                            .removeClass(o.openCssClass)
                                            .children(o.dropdownContentSelector)
                                            .hide();
                                    });
                                    delete cmsobj.$activeMenubar;
                                },
                                o.autohideTimeout)
                        );
                    }
                })
                .bind('mouseenter', function () {
                    if (cmsobj.$activeMenubar) {
                        clearTimeout(cmsobj.$activeMenubar.data('autohideTimer'));
                    }
                });
        });
    };

    // Enforced assumption: only one menubar may be active at once
    // n.b. "active" means a dropdown within that menubar is open
    function closeMenubarDropdowns() {
        $.each(cmsobj.menubars, function () {
            var $menubar = $(this);
            var o = $menubar.data('config'); // recover config from active menubar

            if (o) {
                $menubar.find(o.dropdownSelector).each(function () {
                    $(this)
                        .data('edit-open', false)
                        .removeClass(o.openCssClass)
                        .children(o.dropdownContentSelector)
                        .hide();
                });
            }
        });

        delete cmsobj.$activeMenubar;
    }

    function saveTranslation() {
        var $samuraiEditForm = $("#samuraiCMSeditContentForm");
        var $samuraiEditResponseContainer = $("#samuraiEditResponse");

        $samuraiEditForm.addClass("loading");
        $samuraiEditForm.find('dl').append('<input type="hidden" name="publish" value="Publish" style="display:none" />');

        $.ajax({
            type: "POST",
            url: $samuraiEditForm.attr('action'),
            data: $samuraiEditForm.serialize(),
            cache: false
        }).done(function (response) {
            $samuraiEditResponseContainer.empty().removeClass().show().appendTo($samuraiEditForm);
            if (response.success) {
                $samuraiEditResponseContainer.addClass("alert alert-success").html("Saved!");

                setTimeout(mov.helper.modal.closeCurrent, 1500);

                /** MODEV-683 Render out the result to update the page if we return_render data **/
                try {
                    _updateContent( $("#samuraiCMSeditContentForm").find('#content_id').val(), response.data );
                } catch( e ){
                    _debug( e );
                }

            } else {
                $samuraiEditResponseContainer.addClass("alert alert-danger").html("Not saved...! " + (response.message ? response.message : "unknown error"));
            }
        }).always(function () {
            $samuraiEditForm.removeClass("loading");
        });
    }


    /**
     * Attempts to make a live update to the page content following an AJAX save of data
     * @param message_id
     * @param data
     * @private
     */
    function _updateContent( message_id, data )
    {
        /**
         * If the saved data does not match the current locale, don't worry about a live update
         */
        if( !data || data.content_locale != mov.vars.locale ){
            throw new Error('Live update abandoned: saved content does not match app locale.');
        }

        /**
         * Depending on the content_type, try to make a live update to the content
         */
        var $target = $('span[message_id="' + message_id + '"]');
        var content = data.content.content; 
        var content_type = data.type;

        if( content_type == "image" ){

            $target.find('img').attr('src', content.imgsrc );  

        } else if( content_type == "text" || content_type == "snippet" ){

            $target.html( content );

        } else if( content_type == "imagelink" ){  
            // Check that each component exists before appending 
            var $imageElement = $target.find('img');

            if( $imageElement.length ){
                $imageElement.attr('src', content.imgsrc );

                if( content.target.length ){
                    $imageElement.attr('target', content.target );
                } else {
                    $imageElement.removeAttr('target');
                }
            }

            var $titleElement = $target.find('.cms-element-title');

            if( $titleElement.length ){
                $titleElement.html( content.title )
            } else {
                // Attempt to create / append the container
                var $container = $(document.createElement('div'));
                $container.addClass('cms-element-title').html( '<strong>' +  content.title + '</strong>' ).appendTo( $target.find('.cms-element') );
            }

            if( content.link && content.link.length > 0 ) {
                //    $titleElement.html('<a href="' + content.link + '">' +content.title + '</a>');
                $target.find('.cms-element-title').html('<strong>' + '<a href="' + content.link + '">' +content.title + '</a></strong>');
            } else {
                $target.find('.cms-element-title').html('<strong>' + content.title + '</strong>');
            }

            $target.find('.cms-element-caption').html( content.caption );

            var $linkTextElement = $target.find('.cms-element-readmore');

            if( $linkTextElement.find('a') ){
                $linkTextElement.find('a').remove();
            }

            if( content.link_text && content.link_text.length ){
                var $link = $( '<br /><a href="' + content.link + '">' + content.link_text + '</a>' );
                $target.find('.cms-element-caption').append( $link );
            }

            $target.find('a').attr('href', content.link).attr('target', data.target); 

        } else if( content_type == "featureheader" ) {

            var $container = $target.find('.cms-element-type-featureheader');
            var $heading = $target.find('h1');
            var $subheading = $target.find('h4');

            $container.css({
                'color' : content.text_colour,
                'background-color' : content.background_colour
            });

            $heading.html( content.heading).css('color', content.text_colour );
            $subheading.html( content.subheading ).css('color', content.text_colour );
        }
    }

    /**
     *
     * Common actions fired when the editing is enabled or disabled
     *
     */

    function _exitEditingMode() {
        delete cmsobj.editingmode;

        $('body').removeClass('editmode');
        $('#global-substitutions').remove(); // Not sure why, but this is needed otherwise it ends up with multiple instances
        
        if( _$smSaveAsPanel.hasClass("active") ) {
            // Close the SaveAs RHS dialog if it's open
            _toggleSmSaveAsPanelVisibility();
            $('#sm-ninja-editor-requested-content').remove();
        }

        $("#image_preview_container").remove();

        $("#ckeditor_toolbar").remove();
        $('#ckedit').remove(); // Remove the ckeditor

        mov.section.cms.hideSmSidebarRight(); // hide the right sidebar
        mov.section.cms.showSmSidebarLeft(); // And show the left one

        $('#sm_overlay').remove();
    }

    function _enterEditingMode() {
        mov.section.cms.showSmSidebarRight(); // Show the right sidebar
        mov.section.cms.hideSmSidebarLeft(); // And hide the left one
        cmsobj.editingmode = true;

        /** Global Substitutions dropdown - turn into a "chosen" element and enable injecting into the edit form **/
        $('.chosen-select').chosen({width: "350px"});
        $("#global-substitutions-list").change(function () {
            mov.section.cms.injectTextIntoEditor( $(this).val());
            $(this).val("").trigger("chosen:updated");
        });


        // For WYSIWYGs, initialise a CKEditor
        $('textarea#content').ckeditor(function () {

            $('#cke_contents_content').css({
                'height': '100%',
                'width': '100%'
            });

            // Prevent scroll bars from appearing within the iframe
            $('.zend_form').find('iframe').attr('scrolling', 'no');

            // $('table.cke_editor').css("height", $('#ckedit').dialog().height()); // Commented out by Franco 13-03-2015
            $('table.cke_editor tbody tr:first, table.cke_editor tbody tr:last ').css('height', '0px');

        }, {
            // ::configs
            customConfig: '/assets/vendor/custom/ck/ckeditor_config.js'
        });

        // Make sure Locale and Publish form elements are hidden
        $("#form_element_locale, #form_element_publish").css("display", "none");

        // Override the default form submit action so that it does an AJAX submission instead of the default non-AJAX POST.
        $('#samuraiCMSeditContentForm').submit(function (e) {
            e.preventDefault();
            mov.section.cms.saveTranslation();
        });

        // CKify wysiwyg textareas
        $('textarea.wysiwyg_init').each(function () {
            $(this).ckeditor(function () {
            }, {customConfig: '/assets/vendor/custom/ck/ckeditor_config.js'})
        });

        $('body').addClass('editmode');
    }

    /**
     *
     * Show/Hide right/left sidebars
     *
     */

    // --------- Right sidebar --------- //

    var _$smSidebarRight = $('.sm-menubar_side-right');

    function showSmSidebarRight() {
        _$smSidebarRight.addClass('active');
    }

    function hideSmSidebarRight() {
        _$smSidebarRight.removeClass('active');
    }

    // --------- Left sidebar --------- //

    var _$smSidebarLeft = $('.sm-menubar_side-left');

    function showSmSidebarLeft() {
        _$smSidebarLeft.addClass('active');
    }

    function hideSmSidebarLeft() {
        _$smSidebarLeft.removeClass('active');
    }

    /**
     * Show/Hide lateral panels
     */

    // --------- Save-as panel --------- //

    var _$smSaveAsPanel = $('#sm_editing-save-as-panel');

    var _$smSaveAsPanelDeleteBtn = $('#sm_editing-selected-cancel-btn');
    var _$smSaveAsPanelSaveBtn = $('#sm_editing-selected-btn');

    _$smSaveAsPanel._isPanelVisible = false;

    // Set up the "Save As: Save To Selected Locales" Button to save the translation to all checked locales
    _$smSaveAsPanelSaveBtn.click( function() {
        // Get all checked locales.
        var selectedLocales = $('.sm-editing-table-locale-checkbox:checked').map(function() {
            return $(this).data("locale");
        }).get();

        // Save the translation to the full list of selected locales
        saveContent( selectedLocales );
    });

    // Set up the "Save As: Delete From Selected Locales" Button to unpublish the translation from all checked locales
    _$smSaveAsPanelDeleteBtn.click( function() {
        // Get all checked locales.
        var selectedLocales = $('.sm-editing-table-locale-checkbox:checked').map(function() {
            return $(this).data("locale");
        }).get();

        // Save the translation to the full list of selected locales
        deleteContent( selectedLocales );
    });

    function _toggleSmSaveAsPanelVisibility() {

        /**
         * Prepare the data needed for the panel
         */
        if( !_$smSaveAsPanel._isPanelVisible){
            _$smSaveAsPanel.addClass('active');

            var $historyContent = $('#sm_editing-save-as-panel').find('tbody.versioning-content');
            var historyHtml;

            mov.helper.overlay.apply( $historyContent );

            _getRawHistory( function( data ){
                historyHtml = _buildPublishedHistory( data );

                $historyContent.html( historyHtml );
                mov.helper.overlay.clear( $historyContent );
            });

        } else {
            _$smSaveAsPanel.removeClass('active');
        }

        _$smSaveAsPanel._isPanelVisible = !_$smSaveAsPanel._isPanelVisible;
    }

    /**
     * Each history row with > item has an expando, this is the click action
     */
    function toggleHistoryGroup( locale, clickedElement ){
        _$smSaveAsPanel.find('.' + locale + '-toggle:not(.published)').toggleClass('hidden');

        // And toggle the right/down arrow
        var $iElement = $(clickedElement).find('i');

        if( $iElement ) {
            if( $iElement.hasClass("fa-caret-right") ) {
                $iElement.removeClass("fa-caret-right").addClass("fa-caret-down");
            } else if( $iElement.hasClass("fa-caret-down") ) {
                $iElement.removeClass("fa-caret-down").addClass("fa-caret-right");
            }
        }
    }


    /**
     * Builds two separate HTML tables containing history items
     * @param data
     * @private
     */
    function _buildPublishedHistory( data )
    {
        var returnHtml = '';

        /**
         * Iterate over the passed to build each row
         * Note: the keys for "data" will actually just be an int index, can be ignored.
         * Within each data instance, will be an array with a single "locale" key and then a single array of history
         * so we need to do two "each" calls here... sorry.
         *
         * ie.
         *
         *  [
         *      {"cs":"Czech"},
         *      {"da":[
         *          {"id":"465491","locale":"da","message_id":"snippet-widget-snippet-1417476849-17699-27413","version":"1","content":"some text","published":"1","author_id":"146","updated":"2015-05-26 11:43:08","edition_id":"1","username":"dm@ie.com.au","email":"dm@ie.com.au","content_short":"\r\nThe Movember Foundation\r\n\r\nThe leading global or..."}
         *          ]
         *      },
         *      {"en":"English"},
         *      {"fi_T2":"Finnish (T2)"}
         *  ]
         */
        $.each( data, function( index, item ) {
            Object.keys(item).forEach(function (locale) {
                returnHtml += _buildHistoryRow(item[locale], locale);
            });
        });

        return returnHtml;
    }


    /**
     * Builds a row of history in the save-as sidebar panel and attaches callbacks
     *
     * @version 2015
     * @param data The list of un/published translations for the given locale
     * @param itemLocale  The locale we are building history rows for
     * @private
     */
    function _buildHistoryRow( data, itemLocale ){

        var caret = '';
        var translationsHtml = "";

        var hasHistory = false;
        var hasPublished = false;
        var canEditLocale = true;

        var lastDate = null;

        /**
         * Get some info from the 0th object
         */
        if($.isArray( data ) ) {
            itemLocale = data[0].locale;

            // Build up table rows, one row per existing translation.
            // Initially we will hide any historical (unpublished) translations, but always show published translations.
            // Can then toggle the arrow in the parent row to show unpublished translations.
            data.forEach(function (row) {
                var date = null;
                var user = 'Some anonymous coward';
                var rowClass = row.locale + '-toggle ';
                rowClass += row.published == "1" ? 'published' : 'unpublished';
                rowClass += ( row.published !== "1" ) ? ' hidden' : '';

                if (row.published !== "1") {
                    hasHistory = true;
                } else {
                    hasPublished = true;
                }

                if( row.hasOwnProperty('disabled') && row.disabled ) {
                    canEditLocale = false;
                }

                // Sort out the date string
                if (row.hasOwnProperty('updated') && row.updated.length) {
                    date = new Date(row.updated.replace(/-/g, "/")).toLocaleDateString(locale.replace('_', '-'));
                    if( lastDate == null ) {
                        lastDate = date;
                    }
                }

                // And the credits
                if (row.hasOwnProperty('username') && row.username) {
                    user = row.username + ' (' + row.email + ')';
                }

                var contentDisplay = "";

                if( typeof row.content  == "object" ) {
                    $.each(row.content, function(key, value ) {
                        if( value ) {
                            contentDisplay += key + ": " + value + "<br />";
                            if ($.inArray(key, ["imgsrc"]) > -1) {
                                contentDisplay += '<img class="history-preview-image" src="' + value + '"/><br />';
                            }
                        }
                    });
                } else {
                    if( typeof row.content_short !== "undefined" ) {
                        contentDisplay = row.content_short;
                    } else {
                        contentDisplay = row.content;
                    }
                }

                translationsHtml +=
                    '<tr class="show-tooltip translation-content ' + rowClass + '" title="Published by: ' + user + '" style="cursor:pointer;" title="Click here to load this content into the editor" onclick="mov.section.cms.changeValue('+row.id+')">' +
                    '<td>' + ( date ) + '</td>' +
                    '<td colspan="4" >' +  contentDisplay + '</td>' +
                    '</tr>';
            });

            // Only show the arrow toggle if we have historical unpublished translations.
            if (hasHistory) {
                caret = '<a onclick="mov.section.cms.toggleHistoryGroup(\'' + itemLocale + '\',this);" href="javascript: void(0);"><i class="fa fa-caret-right fa-2x"></i></a>';
            }
        }

        // Now build the parent row for this locale
        returnHtml =
            '<tr>' +
            '<td data-locale="' + itemLocale +'" class="showHistoryTable">' + caret + '</td>' +
            '<td class="sm-editing-table-history-locale">' + itemLocale + '</td>';

        if( canEditLocale ) {
            returnHtml += '<td><a class="save" href="javascript:void(0);" onClick="mov.section.cms.saveContent(\'' + itemLocale + '\')"><i class="fa fa-floppy-o"></i></a></td>';
            if (hasPublished) {
                returnHtml += '<td><a class="delete" href="javascript:void(0);" onClick="mov.section.cms.deleteContent(\'' + itemLocale + '\')"><i class="fa fa-trash-o"></i></td>';
            } else {
                returnHtml += '<td></td>';
            }
        } else {
            returnHtml += '<td colspan="2">No access</td>';
        }

        returnHtml += '<td>';
        if( canEditLocale ) {
            returnHtml += '<input type="checkbox" class="sm-editing-table-locale-checkbox" data-locale="' + itemLocale +'">';
        }
        returnHtml += '</td></tr>' + translationsHtml ;


        return returnHtml;
    }


    // Handle inner behaviour of the save-as panel
    function _saveAsPanelHandler(){

        $('#sm-editing-table--checkbox').on("click", function() {
            // traverse the DOM up to the table and find all input checkboxes, mark as checked
            $(this).closest('table').find('td input:checkbox').prop('checked', this.checked);
        });

        $(".showHistoryTable").on("click", function() {
            $('.sm-editing-table--history').toggle();
        });

    }

    /**
     * Render the CKEditor within a UI dialog for snippet rendering
     *
     * @param subs string Substitutions for this element
     * @param global bool flag for global elements - don't belong to a position on the page so place centrally
     * @param message_id string the SamuraiCms id for the element
     */
    function renderCKEditor(subs, global, message_id) {

        var options = _options.snippets;
        this.currentMessageId = message_id;

        _debug('renderCKEditor');

        // Get the current scroll position to return after opening...
        var initialScroll = $(window).scrollTop();

        // max and min width and height to prevent the dialog looking silly
        var minWidth = options.ckMinWidth;
        var minHeight = options.ckMinHeight + options.substitutionsPadding; // hides subs otherwise

        if (global) { // Place it in the center of the page
            width = 500;
            height = 200;
            top = 300;
            left = ( $(window).width() / 2 ) - (width / 2);
        } else {

            // Account for added padding due to substitutions
            var subsPadding = subs ? options.substitutionsPadding : 0;

            var rect = _getCmsItemCoords(_$mostRecentCmsItem);
            var left = rect.left;
            var top = rect.top;
            var width = (rect.width < minWidth) ? minWidth : rect.width;
            width += 40; // scrollbar avoidance
            var height = rect.height + subsPadding + options.toolbarPadding + options.upperOffset;
            if (height < 250)
                height = 250;
        }
        if (subs) {
            $('div#substitutions').appendTo($('#ckedit'));
            $('div#global-substitutions').appendTo($('#ckedit'));
        }

        _debug('left: ' + left + ', ' + 'top: ' + top + 'width: ' + width + 'height: ' + height);

        // Minimum top value that dialog can be dragged, or element can be placed
        var maxTop = $('#sm_menubars_container').height() * 2 + 66; // include the Ckeditor height for WYSIWYG edit

        // Init the modal
        $('form#samuraiCMSeditContentForm').appendTo($('#ckedit'));
        var modalContent = $('#ckedit').html(); // Get the content to be loaded inside the modal
        $('#ckedit').html(''); // Then empty that container
        mov.helper.modal.loadContent(modalContent, {
            title: 'Editing: ' + message_id,
            onSuccess: function () {
                //mov.section.cms.initDialog(); // Removed by Franco on 16-03-2015
                // mov.section.cms.initCkeditor(top, left); // Removed by Franco on 16-03-2015
                _enterEditingMode();
            },
            onHidden: _exitEditingMode,
            style: 'margin-top:100px;width:960px;' // Make some space on top for the CKEditor, and force the width of the modal to be as wide as the toolbar
        });


        /* If the window tried to scroll to the bottom of a long Samurai element, return it to where it was when clicked */
        $(window).scrollTop(initialScroll);

    }

    /**
     * Misc options to remove bulk from the Dialogue displays when editing an element
     * @type {Object}
     */
    var _options = {
        /** Options used during construction in renderInputEditor() **/
        inputs: {
            minWidth: 250,
            minHeight: 120,
            minTop: 81
        },

        /** Options used during construction in renderCKEditor() **/
        snippets: {
            /* Accounts for the padding to negate the top toolbar */
            toolbarPadding: 98,
            /* Accounts for the padding to negate the addition of substitutions to a dialog */
            substitutionsPadding: 28,
            /* Min values to make a snippetRender dialog look decent */
            ckMinWidth: 340,
            ckMinHeight: 125,
            /* These offsets are to negate the padding of the dialog, placing the text on top of the content */
            upperOffset: 44,
            leftOffset: 18
        }
    };

    function renderInputEditor(subs, global, message_id) {

        var options = _options.inputs;
        _debug('renderInputEditor');

        this.currentMessageId = message_id;

        /* Needs correction of toolbar container if scrolled */
        if ($(window).scrollTop() > $('#sm_menubars_container').height())
            top += $('#sm_menubars_container').height() + 3;
        // These account for the input areas to align input text with content
        var upperOffset = 37 + $(window).scrollTop();
        var leftOffset = 6;

        if (global) {
            // Place it in the center of the page
            width = 300;
            top = 300;
            left = ( $(window).width() / 2 ) - ( width / 2);
        } else {
            var $el = _$mostRecentCmsItem;
            var rect = _getCmsItemCoords(_$mostRecentCmsItem);
            var left = rect.left;
            var top = ( rect.top < options.minTop ) ? options.minTop : rect.top;
            var width = ( rect.width < options.minWidth ) ? options.minWidth : rect.width;
        }
        // Sense check the positioning, need to make sure it isn't hidden under the Samurai toolbar, and bump it right a bit
        if (left == 0)
            left = 50;
        if (top < 100)
            top = top + 50;

        if (subs) {
            $('div#substitutions').appendTo($('#input-editor .zend_form'));
            $('div#global-substitutions').appendTo($('#input-editor .zend_form'));
        }

        // Minimum top value that dialog can be dragged...
        var maxTop = $('#sm_menubars_container').height() * 2;

        var modalContent = $('#input-editor').html(); // Get the content to be loaded inside the modal
        $('#input-editor').html(''); // Then empty that container
        
        mov.helper.modal.loadContent(modalContent, {
            title: 'Editing: ' + message_id,
            onSuccess: function () {
                //mov.section.cms.initDialog(); //Removed by Franco on 16-03-2015
                mov.section.cms.initInlineEditor();
                _enterEditingMode();
                
                $("#form_element_locale").hide();
            },
            onHidden: _exitEditingMode
        });
        
    }

    function renderLinkEditor(subs, global, message_id) {

        _debug('renderLinkEditor');
        this.currentMessageId = message_id;

        var minTop = 81;
        var minWidth = 300;
        var minHeight = 200;

        // Increase modal size for homepage widget items
        if (message_id.substring(0, 16) == 'imagelink-widget') {
            minHeight = 350;
            minWidth = 420;
        }
        if (message_id.substring(0, 14) == 'youtube-widget') {
            minHeight = 400;
            minWidth = 420;
        }
        if (message_id.substring(0, 14) == 'snippet-widget') {
            minHeight = 350;
            minWidth = 400;
        }
        var rect = _getCmsItemCoords(_$mostRecentCmsItem);
        var left = rect.left;
        var top = ( rect.top < 81 ) ? 81 : rect.top;
        var width = ( rect.width < minWidth ) ? minWidth : rect.width;
        var height = ( rect.height < minHeight) ? minHeight : rect.height;

        /* Needs correction of toolbar container if scrolled */
        if ($(window).scrollTop() > $('#sm_menubars_container').height())
            top += $('#sm_menubars_container').height() + 3;
        if (subs) {
            $('div#substitutions').appendTo($('#link-editor .zend_form'));
            $('div#global-substitutions').appendTo($('#link-editor .zend_form'));
        }

        _debug('left: ' + left + ', ' + 'top: ' + top + 'width: ' + width + 'height: ' + height);

        if (global) {
            // Place it in the center of the page
            width = 300;
            top = 300;
            left = ($(window).width() - width) / 2;
        }

        // Figure out what side of the page it is on for ideal placement
        var leftOffset = ( left > $(window).width() / 2 ) ? (width) * -1 : rect.width;

        // Special Case for Hero Tile options on the Home page
        if (message_id.substring(0, 8) == 'herotile') {
            width = 600;
            height = 300;
            top = 300;
            left = ($(window).width() - width) / 2;
            leftOffset = 0;

            // Pause the player and keep the tile still
            var tile = $('span[message_id="' + message_id + '"]').parent();
            var tileId = tile.attr("id");
            var tilePosition = tileId.split('-')[2];

            var img = tile.find('img');

            _debug("Tile ID: " + tileId + ", Position: " + tilePosition);

            // Skip along to the herotile in question (we may be on herotile 2 but then start editing herotile 7 via the addSkipped list)
            mov.widget.herotileCarousel.tilesSkip(tilePosition, true);

            $('<div id="image_preview_container"><img id=\'image_preview\' src=\'' + $(img).attr('src') + '\' alt=\'\' /></div>').appendTo('#sm-ninja-editor-requested-content');

        }

        // Minimum top value that dialog can be dragged, or element can be placed
        var maxTop = $('#sm_menubars_container').height() * 2;

        if (top < minTop) {
            // add margin to top of page, animated, scrollTo
            mov.helper.stash.$content.animate({"padding-top": "+" + maxTop + "px"}, "slow");
            top = minTop; // Never load the titlebar below the menus
        }

        // Special case for showing the footer flash, we don't want it too big
        // and we don't want to hide the flash element...
        if (message_id == 'flash-campaign-bottom-banner') {
            $('#ft_ad object, #ft_ad embed').css('visibility', 'visible');
            width = 400;
            top -= 220;
            left -= leftOffset;
        }

        var modalContent = $('#link-editor').html(); // Get the content to be loaded inside the modal
        $('#link-editor').html(''); // Then empty that container
        mov.helper.modal.loadContent(modalContent, {
            title: 'Editing: ' + message_id,
            onSuccess: function () {
                //mov.section.cms.initDialog(); // Removed by Franco on 16-03-2015
                _enterEditingMode();
            },
            onHidden: _exitEditingMode
        });

    }

    /**
     * Matches the text style of an element to the rendered text style in the form
     *
     * @param src
     */
    $.fn.matchTextStyleTo = function (src) {
        var $src = $(src);
        var src = $src[0];
        $.each(this, function () {
            var $input = $(this);
            var input = $input.get(0);
            var styles = {
                'font-size': _getComputedStyle(src, 'fontSize'),
                'font-family': _getComputedStyle(src, 'fontFamily'),
                'line-height': _getComputedStyle(src, 'lineHeight'),
                'font-style': _getComputedStyle(src, 'fontStyle'),
                'font-weight': _getComputedStyle(src, 'fontWeight'),
                'letter-spacing': _getComputedStyle(src, 'letterSpacing'),
                //'text-transform':     _getComputedStyle(src,'textTransform'),
                'padding-left': _getComputedStyle(src, 'paddingLeft'),
                'padding-top': _getComputedStyle(src, 'marginTop') + _getComputedStyle(src, 'paddingTop'),
                'padding-bottom': _getComputedStyle(src, 'marginBottom') + _getComputedStyle(src, 'paddingBottom'),
                'height': 'auto'
            };
            $input.css(styles);
        });
    };

    /**
     * Handle Enter key press during input editing in Samurai mode
     */
    $.fn.handleEnterKey = function () {
        $(this).on('keypress', function (event) {
            var keycode = (event.keyCode ? event.keyCode : event.which);
            if (keycode == '13') {
                mov.section.cms.saveContent(locale);
                mov.helper.modal.closeCurrent();
            }
        });
    };

    // --------- Removed by Franco on 16-03-2015 --------- //
    /**
     * Common functions when opening jquery dialog widgets
     */

    /**
     * Init for renderInputEditor
     */
    function initInlineEditor() {
        // Make the rendered font style match the field in the page
        // $('#input-editor input').matchTextStyleTo($el); // Removed by Franco on 16-03-2015

        // Prevent the enter key from submitting the form...
        $('#input-editor input').handleEnterKey();
    }

    // --------- Removed by Franco on 16-03-2015 --------- //
    /**
     * CKEditor initialisation for snippet editing
     */
    // function initCkeditor( top, left )
    // {
    // var options = _options.snippets;

    // // Keeps the textarea glued to top left when resizing
    // $('.ui-dialog').css({
    //     'top' : top - options.upperOffset + 'px',
    //     'left' : left - options.leftOffset + 'px'
    // });

    // }
    // --------- END ~ Removed by Franco on 16-03-2015 ~ END --------- //

    /**
     * Called when constructing ui widgets
     */
    function getSaveButtonText() {
        var text = null;

        if (_locale) {
            var localeArr = _locale.split('_');
            var text = 'Save ' + localeArr[0];
            if (localeArr[1])
                text += ' (' + localeArr[1] + ')';
        }
        return text;
    }


    /**
     * Called when the user clicks on a substitution value, places in the form...
     */
    function injectTextIntoEditor(content) {

        var target = false;
        var $form = $('.zend_form');

        /** We can explicitly set a CKEDITOR instance in the form attributes, not constant sadly **/
        if( $form.parent('form').attr('ck-var-target') ){
            target = $('.zend_form').parent('form').attr('ck-var-target')
        }

        if( CKEDITOR && !$.isEmptyObject(CKEDITOR.instances) ) {

            if( target ){
                return CKEDITOR.instances[target].insertText(content);
            }

            if( CKEDITOR.instances.hasOwnProperty('content') ){
                return CKEDITOR.instances.content.insertText(content);
            }

        } else {

            var $input = $form.find('input#content');

            // Pick a likely candidate for Global Substitutions targets
            if( $input.length ) {
                $input.val( $input.val() + content );

                return;
            } else if( $('.zend_form textarea#content_caption').length ) {
                $('.zend_form textarea#content_caption').val($('.zend_form textarea#content_caption').val() + content);
            }
        }
    }

    /**
     * Open a new window containing a preview of a rendered CMS element with certain values.
     * @param data
     * @param message_id
     * @see MODEV-912
     */
    function previewTile( message_id, data )
    {
        var paramString = message_id;

        if( typeof data == 'object' && data.length ){
            data.forEach(function(key) {
                var value = $('#' + key).val();

                if( value && value !== 'undefined' ){
                    paramString += '/' + key + '/' + encodeURIComponent( value );
                }
            })
        }

        var url = encodeURI( '/Samurai/preview/message_id/' + paramString );
        var previewWindow = window.open(url, "previewWindow", "toolbar=no,status=no,resizable=yes,dependent=yes");
    }


    /**
     *  This will call the campaign AuthController->logoutAction() and then
     *  attempt to redirect the user to the same page they're currently on
     */
    function dummyLogout() {
        document.location = baseUrl + "auth/logout/?redirect=" + document.location;
    }

    // ...Same, only this will log the user out of the movember admin completely
    function globalLogout() {
        document.location = mov.vars.adminUrl + "auth/logout/?redirect=" + document.location;
    }

    function setMemberSearchFilter(param, value) {
        memberSearchFilters[param] = value;
    }

    function getMemberSearchFilters() {
        return memberSearchFilters;
    }

    // This will call the campaign AuthController->logMeInAction() to log the user
    // in as a specific Status=DUMMY user and then
    // attempt to redirect the user to the same page they're currently on
    function dummyLogin() {
//        loginAs( dummyFilters );
        loginAs(memberSearchFilters);
    }

    /**
     * Attempt to log the user in as a member, based on the "data" object passed in
     * Can be:
     *   - {id:103} (to log in as member #103)
     *   - {gender:m, team_status:tc} (to log in as a male team captain)
     *   
     * @param data
     */
    function loginAs( data ) {
        mov.helper.overlay.showGlobalLoading();
        $.ajax({
            url: baseUrl + 'index/log-me-in/',
            dataType: "json",
            data: data,
            success: function (data) {
                if (!data)
                    alert('There was an error logging in');
                else {
                    if (data.result) {
                        document.location = document.location + "?correct-locale=true";
                    }
                    else {
                        alert("Error logging in: " + data.error);
                    }
                }
            }
        });
    }

    // Updates the preview image while editing an image elements (preview)
    $('.edit-acc-content li').on({
        mouseenter: function () {
            // Is it an image reference? Get the URL and display a thumbnail
            if ($(this).hasClass('image-image')) {
                var re = /:/i;
                var sp = $(this).text().split(re);
                var src = baseUrl + sp[2].trim();

                $('#image_preview').attr('src', src);

            } else if ($(this).hasClass('herotile-image')) {
                var re = /:/i;
                var sp = $(this).text().split(re);
                var sr = sp[5].split(' ');

                var src = baseUrl + sr[2];

                $('#image_preview').attr('src', src);
            }
        }
    });

    $("button#apply_dummy_options").click(function () {
        // Doesn't really matter if it's missing something...
        mov.section.cms.dummyLogin();
    });

    $("#member-search-tab--dummy").click(function () {
        // Show just the Standard elements
        $("#member-search--id-name").hide();
        $("#member-search--standard-elements").show();
        $("#member-search--extra-elements").hide();
        $("#sm-editions-funnels").show();

        // Update the "member_status" field.  Dummy=4, otherwise Active=1
        $("#member-search-status").val(4);
        $("#member-search--results").hide();

        // Clear out any preselects from the other two sets of elements

        // Update tab states
        $("#member-search-tabs").children().removeClass("active");
        $(this).parent().addClass("active");
    });

    $("#member-search-tab--id-name").click(function () {
        // Show just the Standard elements
        $("#member-search--id-name").show();
        $("#member-search--standard-elements").hide();
        $("#member-search--extra-elements").hide();
        $("#sm-editions-funnels").hide();
        $("#member-search--results").hide();

        // Update the "member_status" field.  Dummy=4, otherwise Active=1
        $("#member-search-status").val(1);

        // Clear out any preselects from the other two sets of elements

        // Update tab states
        $("#member-search-tabs").children().removeClass("active");
        $(this).parent().addClass("active");
    });

    $("#member-search-tab--by-type").click(function () {
        // Show just the Standard elements
        $("#member-search--id-name").hide();
        $("#member-search--standard-elements").show();
        $("#member-search--extra-elements").show();
        $("#sm-editions-funnels").hide();
        $("#member-search--results").hide();

        // Update the "member_status" field.  Dummy=4, otherwise Active=1
        $("#member-search-status").val(1);

        // Clear out any preselects from the other two sets of elements

        // Update tab states
        $("#member-search-tabs").children().removeClass("active");
        $(this).parent().addClass("active");
    });


    $("button#apply_member_search_options").click(function () {
        // Doesn't really matter if it's missing something...
        mov.section.cms.loginAs( memberSearchFilters );
    });

    $(".sm_persona_item").click(function () {
        var $this = $(this);

        if ($this.hasClass('persona_sex'))
            $('.persona_sex').removeClass('selected');
        if ($this.hasClass('persona_team'))
            $('.persona_team').removeClass('selected');
        if ($this.hasClass('persona_network'))
            $('.persona_network').removeClass('selected');

        $this.addClass('selected');
    });

    /*this.checkScroll = function(){
     if($(window).scrollTop() > $('#sm_menubars_container').height() ){
     $('#editingToolbar').addClass('scrolled');
     $('#sm_menubars_container').addClass('scrolled');
     } else {
     $('#sm_menubars_container').removeClass('scrolled');
     }
     };*/

    function editInit() {
        // Flash hiding/showing handled by our modified thickbox now
        populateTranslations();
        populateLocale();
        bindEditDropdowns();
        //mov.section.cms.checkScroll();
    };

    /*  ---------------
     Private methods
     ---------------  */


    function _debug(html) {
        if (!_debugging)
            return;

        if (console) {
            console.log.apply(console, arguments);
            return;
        }

        var newChild = $('<div style="background: black; color: white; padding: 5px; font-size: 8pt">' + html + '</div>');
        $('#debug').prepend(newChild);
        setTimeout(function () {
            newChild.css('color', '#aaa');
        }, 2000);
        if ($('#debug div').length > 10) {
            $('#debug div:last-child').remove()
        }
        ;
    };


    // IE shim for getComputedStyle
    function _getComputedStyle(el, style) {
        var computedStyle;
        if (typeof el.currentStyle != 'undefined') {
            computedStyle = el.currentStyle;
        } else {
            // In case of Firefox throwing
            // "Component returned failure code: 0x80004005 (NS_ERROR_FAILURE) [nsIDOMWindow.getComputedStyle]".
            try {
                computedStyle = getComputedStyle(el, null)
            } catch (e) {
                return undefined;
            }
        }

        return computedStyle[style];
    };


    function _toSentenceCase(str) {
        return str.charAt(0).toUpperCase() + str.substr(1).toLowerCase();
    };


    // e.g. data-content-actions="add-child(type) do-stuff(type,/param/value/param2/value2,param3/value3,param4=value4)"
    //
    function _deserializeActions(actionsString) {
        if (!actionsString)
            return {};

        actions = {};
        var actionStrings = actionsString.split(')');
        $.each(actionStrings, function () {
            var actionString = this.toString().trim();
            if (actionString == '') return;
            var parts = actionString.split('(');
            var name = parts[0];
            var params = parts.length > 1 ? parts[1] : '';
            var type = params.split(',')[0]; // first argument is assumed to be type
            var extraParams = parts.length >= 2 ? params.split(',').slice(1) : null; // all following arguments assumed to be extra URL params to be appended
            var extraParamsString = null;
            if (extraParams) {
                extraParamsString = extraParams
                    .join('/')
                    .replace('=', '/')
                    .replace(/^\/+|\/+$/g, ''); // trim forward-slashes
            }

            var href = '';

            if (name == 'add-child') {
                href = mov.vars.adminUrl + type + '/new';
                if (extraParamsString)
                    href = href + '/' + extraParamsString;
            }

            actions[name] = {
                label: _actionLabels[name] ? _actionLabels[name] : name,
                type: type,
                href: href
            };
        });
        return actions;
    };


    function _getCmsItemInfo(el) {
        var $el = $(el);
        el = $el.get(0);
        var isLink = $el.hasClass(_cls.isLink);
        var actions = _deserializeActions($el.attr('data-content-actions'));
        var isContainer = !!actions['add-child']; // to boolean

        var id = '';
        var href = '';
        var options = '';
        var type = '';
        var extraParams = '';

        if (!isLink) {
            id = $el.attr('message_id');
            if (typeof id === 'undefined') {
                mov._warn(
                    '_getCmsItemInfo: couldn\'t get message_id attribute for ' +
                    el.tagName +
                    (el.id ? ('#' + el.id) : '') +
                    (el.className ? ('.' + el.className.replace(/( )+/, '.')) : '') +
                    ':contains(' + el.innerHTML + ')'
                );
                return undefined;
            }
            // Do this if the Samurai message_id was found.
            if (id) {
                type = id.split('-')[0];
                options = $el.attr('options');
                //href = (document.location.protocol == "https:" ? country + '/' : '') + language + '/cms/edit/content_id/' + id  + '/options/' + escape(options);
                /* options may contain URLs and other characters, so just escape the lot... */
                href = '/SamuraiCMS/edit/content_id/' + id + '/options/' + escape(options) + '/locale/' + _locale;
                href += '/';//?height=600&width=800';

                /**
                 * We keep having issues with https://au.dev.movember.com/mobile/locale?format=javascript&_translate=1
                 * and JS errors which prevent editing of items, this is an attempt to fix that as https seems to die
                 */
                //if( window.location.protocol == 'https:' ){
                //    href = window.location.origin.replace('https', 'http') + href;
                //}
            }
        } else {
            id = $el.attr('data-content-id');
            type = $el.attr('data-content-type');
            if (isContainer) {
                href = mov.vars.adminUrl + type;
            } else {
                href = mov.vars.adminUrl + type + '/edit/id/' + id;
            }

            extraParams = $el.attr('data-content-params');
            if (extraParams) {
                href = href + '/' + extraParams;
            }
        }


        return {
            id: id,
            type: type,
            options: options,
            actions: actions,
            href: href,
            isLink: isLink,
            isContainer: isContainer,
            isPage: $el.attr("id") == _id.pageLevelCmsItem,
            ignoreMe: $el.attr('data-content-ignore')
        };
    };


    function _getCmsItemAction(el, title) {
        return $(el).data("cmsItem").actions[title];
    };

    /**
     * Given an element el, will return the appropriate item type to mouse event handlers
     *
     * @return {*|jQuery|HTMLElement}
     */
    var _getCmsItemByType = function (el) {

        if (el.data('cms-item')) {
            if (el instanceof jQuery)
                $el = el;
            else
                $el = $(el);
        } else {
            $el = el;
        }

        return $el;
    }

    /**
     * Checks whether an element is a ninja element
     *
     * @return Boolean true when your element is a ninja
     */
    function _isNinjaHandle($el) {
        return $el.hasClass('sm-handle-container');
    }


    function _cmsItem_onMouseEnter(e) {
        var $el = _getCmsItemByType($(this));

        _debug($(this)[0].tagName + '.' + $(this)[0].className + ' fired cmsItem_onMouseEnter ("' + $(this).text().substring(0, 30) + '")');
        clearTimeout(_hoverTimeout);

        if (_$currentCmsItem[0] == $el[0] || _isNinjaHandle($el)) {
            e.stopPropagation();
            return;
        }

        _setCurrentCmsItem($el);

        e.stopPropagation();
    };


    function _cmsItem_onMouseLeave(e) {
        var $el = _getCmsItemByType($(this));

        _debug($(this)[0].tagName + '.' + $(this)[0].className + ' fired cmsItem_onMouseLeave ("' + $(this).text().substring(0, 30) + '")');
        clearTimeout(_hoverTimeout);

        _hoverTimeout = setTimeout(function () {
            var $parents = $el.parents('.' + _cls.cmsItem);
            if ($parents.length > 0)
                _setCurrentCmsItem($parents[0]);
            else
                _setCurrentCmsItem(null);
        }, _mouseLeaveTimeoutMs);

        e.stopPropagation();
    };

    function _ninja_onMouseEnter(e) {
        _cmsItem_onMouseEnter.call(this, e);
        _$hoveredCmsItemFrames.last().addClass(_cls.cmsItemHighlightFrame);
    };
    function _ninja_onMouseLeave(e) {
        _cmsItem_onMouseLeave.call(this, e);
        _$hoveredCmsItemFrames.last().removeClass(_cls.cmsItemHighlightFrame);
    };

    function _updateHoveredCmsItems() {
        if (!_visible)
            return;

        var $el = _$currentCmsItem;
        var $oldHoveredCmsItems = jQuery.extend({}, _$hoveredCmsItems); // save clone of jQuery object here
        _$hoveredCmsItems = $el.add($el.parents('.' + _cls.cmsItem));

        // Unhighlight existing hovered items
        if ($oldHoveredCmsItems && $oldHoveredCmsItems.length > 0 ) {
            $oldHoveredCmsItems.removeClass(_cls.cmsItemParentOfCurrent).removeClass(_cls.cmsItemCurrent);
            $oldHoveredCmsItems.css({
                'z-index': '',
                'position': ''
            });
            if ($($oldHoveredCmsItems[0]).data('boosted-zindex-parent')) {
                $($oldHoveredCmsItems[0]).data('boosted-zindex-parent').css('z-index', '');
                $($oldHoveredCmsItems[0]).removeData('boosted-zindex-parent');
            }
            _$hoveredCmsItemFrames.remove();
            _$hoveredCmsItemFrames = $();
        }

        if (_$currentCmsItem.length == 0) {
            return;
        }

        // Highlight all hovered items, i.e. show editable item nesting
        _$hoveredCmsItems.not($el).addClass(_cls.cmsItemParentOfCurrent);
        $el.addClass(_cls.cmsItemCurrent);

        var hoveredCmsItemFrames = [];

        // Choose parent element of 'frames'
        var $appendToElement = $(_cmsContentRoot);
        var $positioningElement = $(_cmsContentRoot);
        var $hoveredCmsItemParentsOuterFirst = _$hoveredCmsItems.first().parentsUntil($appendToElement).addBack();
        var hitOverflowHidden = false;
        var $blacklistedParents = $('.sm-js-cmsitem'); // parents known to cause problems ...
        $hoveredCmsItemParentsOuterFirst.each(function () {
            hitOverflowHidden = hitOverflowHidden || _getComputedStyle(this, 'overflow') == 'hidden';
            if (!hitOverflowHidden && $blacklistedParents.filter($(this)).length == 0) {
                var currentBackgroundColor = _getComputedStyle(this, 'backgroundColor');
                var currentPositioning = _getComputedStyle(this, 'position');
                // The frames at least have to be in front of the innermost background color
                if (currentBackgroundColor != 'transparent' && currentBackgroundColor != 'rgba(0, 0, 0, 0)') {
                    $appendToElement = $(this);
                }
                // and they absolutely must be in the innermost positioning context
                if (currentPositioning != 'static') {
                    $appendToElement = $(this);
                    $positioningElement = $(this);
                }
            }
        });

        // Insert a 'frame' just behind each of the hovered elements
        _$hoveredCmsItems.each(function () {
            var $el = $(this);

            var offset = {
                left: 0,
                top: 0
            };

            /**
             * The 'Cannot read property 'left' of undefined issue...
             */
            if (typeof $positioningElement.offset() !== "undefined") {
                offset.top = $positioningElement.offset().top;
                offset.left = $positioningElement.offset().left;
            }

            var $newFrame = $('<div></div>')
                .addClass(_cls.cmsItemCurrentFrame)
                .css({
                    'position': 'absolute',
                    'left': ($el.offset().left - offset.left) + 'px',
                    'top': ($el.offset().top - offset.top) + 'px',
                    'width': $el.innerWidth() + 'px',
                    'height': ( $el.innerHeight() > 0 ? $el.innerHeight() : 200 ) + 'px'
                });
            if ($el.hasClass(_cls.cmsItemContainer)) {
                $newFrame.addClass(_cls.cmsItemContainerFrame);
            }
            if ($el.hasClass(_cls.cmsItemParentOfCurrent)) {
                $newFrame.addClass(_cls.cmsItemParentOfCurrentFrame);
            }
            hoveredCmsItemFrames.push($newFrame[0]);
        });

        _$hoveredCmsItemFrames = $(hoveredCmsItemFrames);

        var outermostZindex = 0;
        var $elementWithThatIndex = $();
        var $hoveredCmsItemParentsInnerFirst = $($hoveredCmsItemParentsOuterFirst.toArray().reverse());

        // Get the parent element with highest z-index (in the positioning context of $appendToRoot)
        $hoveredCmsItemParentsInnerFirst.each(function () {
            var currentZindex = _getComputedStyle(this, 'zIndex');
            var currentPositioning = _getComputedStyle(this, 'position');
            if (currentZindex != 'auto' && currentPositioning != 'static') {
                outermostZindex = currentZindex;
                $elementWithThatIndex = $(this);
            }
        });

        $elementWithThatIndex.add(_$hoveredCmsItemFrames).css({
            'z-index': outermostZindex
        });

        $el.css({
            'z-index': parseInt(outermostZindex) + 1,
            'position': 'relative'
        })
            .data(
            'boosted-zindex-parent', $elementWithThatIndex
        );

        $appendToElement.prepend(_$hoveredCmsItemFrames);
    };


    // Delete the old ninja
    function _removeNinja() {
        _$currentNinja.remove();
    };


    function _updateNinja() {
        var $el = _$currentCmsItem;

        if (!_visible)
            return;

        _removeNinja();

        // Turn off the ninja for this element if it doesn't exist, or has been told to be
        // ignored
        if (_$currentCmsItem.length == 0 || $el.attr('data-content-ignore') == "true") {
            _$id('status').html('');
            return;
        }

        var cmsItem = $el.data("cmsItem");

        if (!cmsItem.isLink) {

            _$currentNinja = $(
                '<div class="sm-handle-container sm-handle-container_editable">' +
                '<a ' +
                'title="Samurai Content Editor - ' + cmsItem.id + '" ' +
                'class="sm-handle sm-handle_editable"' +
                'href="' + cmsItem.href + '" ' +
                '>' +
                '</a>' +
                '</div>'
            );

            // blank current cms item, ready for lightbox
            _$currentNinja.find('a').click(function (e) {
                // Do not fire the link normally
                e.preventDefault();
                _setCurrentCmsItem(null);
                // Create the host container for the AJAX call:
                mov.helper.stash.$body.append('<div id="sm-ninja-editor-requested-content"></div>');
                mov.helper.overlay.showGlobalLoading();
                // Populate it with the requested content:
                $('#sm-ninja-editor-requested-content').load($(this).attr('href'), function () {
                    _initCollapsibleAreas();
                    mov.helper.overlay.hideGlobalLoading();
                });
            });

            _$id('status').html(cmsItem.id);

        } else {

            // For direct link to admin
            if (cmsItem.isContainer) {
                _$currentNinja = $(
                    '<div class="sm-handle-container sm-handle-container_linkable sm-handle-container_linkable_container' + (cmsItem.isPage ? ' sm-handle-container-page' : '') + '">' +
                    '<a ' +
                    'title="Samurai Admin - ' + cmsItem.type + '" ' +
                    'class="sm-handle sm-handle_linkable" target="_blank" ' +
                    'href="' + cmsItem.href + '"' +
                    '>' +
                    '</a>' +
                    '</div>'
                );
                _$id('status').html("Collection: " + cmsItem.type);
            } else {
                _$currentNinja = $(
                    '<div class="sm-handle-container sm-handle-container_linkable' + (cmsItem.isPage ? ' sm-handle-container-page' : '') + '">' +
                    '<a ' +
                    'title="Samurai Admin - Edit ' + cmsItem.id + '" ' +
                    'class="sm-handle sm-handle_linkable" target="_blank" ' +
                    'href="' + cmsItem.href + '"' +
                    '>' +
                    '</a>' +
                    '</div>'
                );
                _$id('status').html(cmsItem.type + " #" + cmsItem.id);
            }
        }

        var addChildAction = cmsItem.actions['add-child'];
        if (addChildAction) {
            _$currentNinja.append($(
                '<a ' +
                'title="Samurai Admin - New ' + addChildAction.type + '"' +
                'class="sm-action sm-action_add-child" target="_blank" ' +
                'href="' + addChildAction.href + '"' +
                '>' +
                addChildAction.label +
                '</a>'
            ));
        }

        _$currentNinja
            .data('cms-item', $el)
            .mouseenter(_ninja_onMouseEnter)
            .mouseleave(_ninja_onMouseLeave);

        $("body").append(_$currentNinja);

        // Positioning is handled this way because you can't insert the ninja as
        // a child of a <tr> without causing problems

        var offset = $el.offset();
        var left = offset.left;

        var top = offset.top + 0; // Current hack to take into account Samurai toolbar height
        var width = $el.width();
        var height = $el.height();

        var m = {
            x: _mousePos.x - left,
            y: _mousePos.y - top
        };
        if (width > 300 && $el.data("cmsItem").isContainer) {
            if (m.x > width / 2) {
                left = left + width;
                _$currentNinja.addClass('sm-handle-container_on-right');
            }
        }
        if (height > 100 && $el.data("cmsItem").isContainer) {
            if (m.y > height / 2) {
                top = top + height;
                _$currentNinja.addClass('sm-handle-container_on-bottom');
            }
        }

        // We currently put negative padding on ".sm-handle-container_linkable_container" of the width of the samurai icon
        // If the current absolute left position of the element is less than this, it won't appear on the page, so lets bump it back to hard-left of page
        if( left < 27 ) {
            left = 27;
        }
        // And again for top
        if( top < 46 ) {
            top = 46;
        }

        _$currentNinja.css({
            display: 'block',
            position: 'absolute',
            left: left,
            top: top,
            'z-index': 99999
        });
    }


    // mutator for _visible
    function _setVisible(visible) {
        _visible = visible;

        // if ninjas don't disappear on mouseleave, this has an effect
        if (!_visible && _$currentNinja != null) {
            _setCurrentCmsItem(null);
        }
    };


    // mutator for _currentCmsItem
    function _setCurrentCmsItem(el) {
        _$hoveredCmsItemFrames.last().removeClass(_cls.cmsItemHighlightFrame);
        _$currentCmsItem = el ? $(el) : $();
        _$currentCmsItem.data('last-offset', _$currentCmsItem.offset());
        _$mostRecentCmsItem = _$currentCmsItem.length ? _$currentCmsItem : _$mostRecentCmsItem;
        _mostRecentCmsItemCoords = _getCmsItemCoords(_$mostRecentCmsItem, true);
        _updateNinja();
        _updateHoveredCmsItems();
    };


    function openServerBrowser(url, width, height) {
        // MF (2012-01-13): Only references to this function are in this JS file, and are commented out
        var iLeft = (screen.width - width) / 2;
        var iTop = (screen.height - height) / 2;

        var sOptions = "toolbar=no,status=no,resizable=yes,dependent=yes";
        sOptions += ",width=" + width;
        sOptions += ",height=" + height;
        sOptions += ",left=" + iLeft;
        sOptions += ",top=" + iTop;

        var oWindow = window.open(url, "BrowseWindow", sOptions);
    };

    function _getCmsItemCoords(el, ignoreCache) {
        var $el = (typeof el != 'undefined') ? $(el) : _$mostRecentCmsItem;

        if ($el[0] == _$mostRecentCmsItem[0] && !ignoreCache)
            return _mostRecentCmsItemCoords;

        var offset = $el.offset();

        if (offset) {
            var left = offset.left;
            var top = offset.top;
            var width = $el.width();
            var height = $el.height();

            return {
                left: left,
                top: top,
                width: width,
                height: height
            };
        }

        return null;

    };

    function _initCollapsibleAreas() {
        $(".samurai-collapsible-set").each(function(index) {
            var legend = $(this).find("legend");
            legend.prepend('<div class="samurai-collapsible-toggle"></div>');
            legend.click(function(ev) {
                var el = $(this);
                var fieldset = el.closest(".samurai-collapsible-set");
                fieldset.toggleClass("set-collapsed");
            });
        });
    }

    return {
        init: init,
        refreshSamurai: refreshSamurai,
        renderSkippedItems: renderSkippedItems,
        changeValue: changeValue,
        close_sm_overlay: close_sm_overlay,
        closeMenubarDropdowns: closeMenubarDropdowns,
        closeMenuDropdowns: closeMenubarDropdowns,
        showSmSidebarRight: showSmSidebarRight,
        hideSmSidebarRight: hideSmSidebarRight,
        showSmSidebarLeft: showSmSidebarLeft,
        hideSmSidebarLeft: hideSmSidebarLeft,
        deleteTranslation: deleteTranslation,
        dummyLogin: dummyLogin,
        dummyLogout: dummyLogout,
        loginAs: loginAs,
        editInit: editInit,
        globalLogout: globalLogout,
        setMemberSearchFilter: setMemberSearchFilter,
        getMemberSearchFilters: getMemberSearchFilters,
        //initCkeditor: initCkeditor, // Removed by Franco on 16-03-2015
        // initDialog: initDialog, // Removed by Franco on 16-03-2015
        initElement: initElement,
        initInlineEditor: initInlineEditor,
        injectTextIntoEditor: injectTextIntoEditor,
        previewTile: previewTile,
        promptUpdateElement: promptUpdateElement,
        renderCKEditor: renderCKEditor,
        renderInputEditor: renderInputEditor,
        renderLinkEditor: renderLinkEditor,
        retrieveHistory: retrieveHistory,
        saveContent: saveContent,
        reloadHistory: reloadHistory,
        deleteContent: deleteContent,
        saveTranslation: saveTranslation,
        selectFile: selectFile,
        selectImage: selectImage,
        setEditableItems: setEditableItems,
        setSkippedItems: setSkippedItems,
        startScroll: startScroll,
        switchEdition: switchEdition,
        switchFunnel: switchFunnel,
        toggleHistoryGroup: toggleHistoryGroup,
        updateVideoPreview: updateVideoPreview,
        updateYouTubePreview: updateYouTubePreview
    };

}());


$.fn.samurize = function () {
    if (!locale) {
        console.log('Samurai has not been initialised yet -- can\'t Samurize anything');
        return;
    }

    this.each(function () {
        mov.section.cms.initElement(this);
    })
};


$(document).ready(
    function () {
        mov.section.cms.init(locale, mov.vars.samuraiContainerSelector);
    }
);

/*
 * Adjust the behavior of the dataProcessor to avoid styles
 * and make it look like FCKeditor HTML output.
 */
function configureHtmlOutput(ev) {
    var editor = ev.editor,
        dataProcessor = editor.dataProcessor,
        htmlFilter = dataProcessor && dataProcessor.htmlFilter;

    // Out self closing tags the HTML4 way, like <br>.
    dataProcessor.writer.selfClosingEnd = '>';

    // Make output formatting behave similar to FCKeditor
    var dtd = CKEDITOR.dtd;
    for (var e in CKEDITOR.tools.extend({}, dtd.$nonBodyContent, dtd.$block, dtd.$listItem, dtd.$tableContent)) {
        dataProcessor.writer.setRules(e,
            {
                indent: true,
                breakBeforeOpen: true,
                breakAfterOpen: false,
                breakBeforeClose: !dtd[e]['#'],
                breakAfterClose: true
            });
    }

    // Output properties as attributes, not styles.
    htmlFilter.addRules(
        {
            elements: {
                $: function (element) {
                    // Output dimensions of images as width and height
                    if (element.name == 'img') {
                        var style = element.attributes.style;

                        if (style) {
                            // Get the width from the style.
                            var match = /(?:^|\s)width\s*:\s*(\d+)px/i.exec(style),
                                width = match && match[1];

                            // Get the height from the style.
                            match = /(?:^|\s)height\s*:\s*(\d+)px/i.exec(style);
                            var height = match && match[1];

                            if (width) {
                                element.attributes.style = element.attributes.style.replace(/(?:^|\s)width\s*:\s*(\d+)px;?/i, '');
                                element.attributes.width = width;
                            }

                            if (height) {
                                element.attributes.style = element.attributes.style.replace(/(?:^|\s)height\s*:\s*(\d+)px;?/i, '');
                                element.attributes.height = height;
                            }
                        }
                    }

                    // Output alignment of paragraphs using align
                    if (element.name == 'p') {
                        style = element.attributes.style;

                        if (style) {
                            // Get the align from the style.
                            match = /(?:^|\s)text-align\s*:\s*(\w*);/i.exec(style);
                            var align = match && match[1];

                            if (align) {
                                element.attributes.style = element.attributes.style.replace(/(?:^|\s)text-align\s*:\s*(\w*);?/i, '');
                                element.attributes.align = align;
                            }
                        }
                    }

                    if (!element.attributes.style)
                        delete element.attributes.style;

                    return element;
                }
            },

            attributes: {
                style: function (value, element) {
                    // Return #RGB for background and border colors
                    return convertRGBToHex(value);
                }
            }
        });
}


/**
 * Convert a CSS rgb(R, G, B) color back to #RRGGBB format.
 * @param Css style string (can include more than one color
 * @return Converted css style.
 */
function convertRGBToHex(cssStyle) {
    return cssStyle.replace(/(?:rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\))/gi, function (match, red, green, blue) {
        red = parseInt(red, 10).toString(16);
        green = parseInt(green, 10).toString(16);
        blue = parseInt(blue, 10).toString(16);
        var color = [red, green, blue];

        // Add padding zeros if the hex value is less than 0x10.
        for (var i = 0; i < color.length; i++)
            color[i] = String('0' + color[i]).slice(-2);

        return '#' + color.join('');
    });
}
