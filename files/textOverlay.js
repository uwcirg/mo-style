/**
 * Define a block of text that appears on top of an image or another block
 * Note: this module is coupled with styles/shared-elements/_text-overlay.scss
 * IMPORTANT: this module should be included dynamically using mov.helper.misc.requireScript only by the pages that need it
 *
 */

mov.widget.textOverlay = (function(){

    var $textOverlayTile;
    var $textOverlayContent;

    function init(){

        $textOverlayTile = mov.helper.stash.$content.find('.js-text-overlay');
        $textOverlayContent = $textOverlayTile.find('.js-text-overlay--content');

        if( mov.vars.client.isDesktop ){
            _overlayOnHover();
        }

        else {
            _overlayOnClick();
        }
    }

    // attached function for hover on Desktop devices
    function _overlayOnHover() {

        $textOverlayTile.on("mouseenter", function() { // on mouseenter
            var self = $(this);
            self.find($textOverlayContent).addClass('active'); // add the overlay
        }).on("mouseleave", function() { // on mouseleave
            var self = $(this);
            self.find($textOverlayContent).removeClass('active'); // remove the overlay
        });

    }

    // attached function for click events on touch devices
    function _overlayOnClick() {
        $textOverlayTile.on('click', function() {
            var self = $(this);
            self.find($textOverlayContent).toggleClass('active');
        });
    }

    /**
     * Return the public API
     */

    return {
        init: init
    };

}());
