// ==UserScript==
// @name        osugame_func+
// @namespace   /r/osugame
// @author      /u/N3G4
// @description Adds osu! related functionality to /r/osugame
// @include     *reddit.com/r/osugame*
// @version     1.3.8
// @run-at      document-end
// @grant       GM_openInTab
// @grant       GM_addStyle
// @grant       GM_registerMenuCommand
// @grant       GM_getValue
// @grant       GM_setValue
// @grant       GM_xmlhttpRequest
// ==/UserScript==

// ~ ~~ Features ~~ ~
// * Turns URLs in user flairs to clickable links
// * Displays player name and pp/rank on flair hover
// * Adds live twitch streams to the sidebar
//
// ~      ~~~~      ~

var githubURL = "https://github.com/v0x76/osugame_funcp";

var g_streams = GM_getValue("streams", true);
var g_flairs = GM_getValue("flairs", true);
var g_parallax = GM_getValue("parallax", true);
var g_debug = GM_getValue("debug", false);

function setupGMMenu() {
    var setStreams = function() {
        g_streams = !g_streams; 
        GM_setValue("streams", g_streams);
    };

    var setFlairs = function() {
        g_flairs = !g_flairs; 
        GM_setValue("flairs", g_flairs);
    };

    var setParallax = function() {
        g_parallax = !g_parallax; 
        GM_setValue("parallax", g_parallax);
    };

    var setDebug = function() {
        g_debug = !g_debug; 
        GM_setValue("debug", g_debug);
    };

    GM_registerMenuCommand("Toggle flair hover info", setFlairs, "f");
    GM_registerMenuCommand("Toggle streams", setStreams, "s");
    GM_registerMenuCommand("Toggle header parallax", setParallax, "p");
    GM_registerMenuCommand("Toggle debug mode", setDebug, "d");
    GM_registerMenuCommand("Open github repo", function(){ GM_openInTab(githubURL); }, "g");
    GM_registerMenuCommand("DL latest version of script", 
        function(){ GM_openInTab(githubURL + "/raw/master/osugame_func+.user.js"); }, "v");
}

function makeStylesheet() {
    GM_addStyle(
        "#ofp-infobox { position: absolute; padding: 2px 5px; " +
            "background-color: #A9A9FF; opacity: 0.9; color: #FFF; " +
            "font-size: 11px; }" +
        "#ofp-infobox::before { content: ''; position: absolute;" +
            "bottom: -8px; font-size: 0; opacity: 0.9;" +
            "border-style: solid; border-width: 4px;" +
            "border-color: #A9A9FF transparent transparent; }" +
        ".ofp-streaminfo { width: 100%; margin: 4px 0; padding: 2px; " +
            "background: #EEF; color: #888; }" +
        ".ofp-streaminfo strong { color: #369; font-size: 12px; }" +
        ".ofp-streaminfo p { margin: 3px 0 0 !important; }" +
        ".ofp-streaminfo span { color: #333; }"
    );
}

// take sum of offsets up the node tree
function getXYPos(element) {
    var leftval = 0;
    var topval = 0;
    while(element) {
        leftval += element.offsetLeft;
        topval += element.offsetTop;
        element = element.offsetParent;
    }
    
    return {
        x: leftval,
        y: topval
    };
}

function Flairbox() {
    var timer;
    var waiting = false;

    var clickify = function(flair) {
        var flairtext = flair.innerHTML;
        flair.innerHTML = flairtext.link(flairtext);
        flair.firstChild.title = ""; // prevent tooltip getting in the way
    };

    var createInfoBox = function() {
        var html = "<div id='ofp-infobox' style='display:none; top:0px; left:0px;'></div>";
        var newelement = document.createElement("div"); 
        newelement.innerHTML = html;
        document.getElementsByTagName("body")[0].appendChild(newelement.firstChild);
    };

    var setHover = function(flair) {
        var box = document.getElementById("ofp-infobox");
        flair.firstChild.onmouseover = function(){
            timer = setTimeout(showInfoBox, 200, box, flair);
        };
        flair.firstChild.onmouseout = function(){
            clearTimeout(timer);
            hideInfoBox(box, flair);
        };
    };

    var showInfoBox = function(box, flair) {
        waiting = true;

        GM_xmlhttpRequest({
            method: "GET",
            url: flair.firstChild.innerHTML,
            onload: function(response){ onUserpageLoad(response, box, flair); },
            onerror: function(){ console.error("Error on HTTP GET request."); }
        });
        reposInfoBox(box, flair); 
    };

    var hideInfoBox = function(box) {
        waiting = false;
        box.style.display = "none"; // hide info box
    };

    var onUserpageLoad = function(response, box, flair) {
        var resdom = document.createElement("html");
        resdom.innerHTML = response.responseText;

        var playername = resdom.getElementsByClassName("profile-username")[0]
            .innerHTML;

        var userid = response.finalUrl.split("/").pop();
        // need userId to grab rank data
        if(userid.search("[a-z]") !== -1) {
            // grab from javascript variable
            userid = resdom.children[1].getElementsByTagName("script")[0]
                .innerHTML.split(";\n")[0].split("= ")[1];

            // second route
            if(userid.search("[a-z]") !== -1) {
                // grab from avatar filename
                var avatar = resdom.getElementsByClassName("avatar-holder")[0];
                if(avatar) {
                    userid = avatar.firstChild.src.split("_")[0].split("/").pop();
                }

                // third route
                if(!avatar || userid.search("[a-z]") !== -1) {
                    // grab from friend button
                    userid = resdom.getElementsByClassName("centrep")[1]
                        .firstElementChild.getAttribute("href").split(/\/|\?/)[2];
                }
            }
        }

        var statsurl = "https://osu.ppy.sh/pages/include/profile-general.php?u=" +
            userid + "&m=0";

        if(waiting) {
            GM_xmlhttpRequest({
                method: "GET",
                url: statsurl,
                onload: function(response){ onStatsLoad(response, box, playername); },
                onerror: function(){ console.error("Error on HTTP GET request"); }
            });
        }
    };

    var onStatsLoad = function(response, box, infostring) {
        if(waiting) {
            var resdom = document.createElement("html");
            resdom.innerHTML = response.responseText;

            var playerrank = resdom.getElementsByClassName("profileStatLine")[0]
                .firstElementChild.innerHTML.split(": ")[1];

            infostring = infostring + " | " + playerrank;
            box.innerHTML = infostring;
            box.style.display = "block"; // display info box
        }
    };

    var reposInfoBox = function(box, element) {
        const { x, y } = getXYPos(element);
        box.style.left = x+"px";
        box.style.top = y-20+"px";
    };

    createInfoBox();

    var allflairs = document.getElementsByClassName("flair");
    if(g_debug) console.log("Found " + allflairs.length + " flairs.");

    var flairs = [];
    for(let i=allflairs.length-1; i>0; i--) {
        var flairtext = allflairs[i].innerHTML;

        // select only flairs with valid URLs
        if( flairtext.search("^https?://") !== -1 ) {
            if(g_debug) console.log("Found URL: " + flairtext);
            flairs.push(allflairs[i]);
            clickify(allflairs[i]);
            if( g_flairs && flairtext.search("^https?://osu\.ppy\.sh/u/") !== -1 ) {
                setHover(allflairs[i]);
            }
        }
    }

}

function Streambox() {
    var makeSidebarBox = function() {
        var html =
            "<div id='ofp-streambox'><h2>Live streams</h2>" +
            "<div id='ofp-streamone'></div><div id='ofp-streamtwo'></div>" +
            "<div id='ofp-streamthree'></div></div>";

        var newelement = document.createElement("div"); 
        newelement.innerHTML = html;
        var insertpoint = document.getElementsByClassName("titlebox")[0]
            .getElementsByClassName("usertext-body")[0]
            .getElementsByTagName("h2")[1];

        return insertpoint.parentNode.insertBefore(newelement, insertpoint);
    };

    var grabStreams = function() {
        GM_xmlhttpRequest({
            method: "GET",
            url: "https://api.twitch.tv/kraken/streams?game=osu!&limit=3",
            onload: function(response){ extractInfo(response); },
            onerror: function(){ console.error("Error on HTTP GET request"); }
        });
    };

    var extractInfo = function(response) {
        var jsondata = JSON.parse(response.responseText);

        var fullinfo = [];
        for(let i=0; i<3; i++) {
            fullinfo.push({
                username: jsondata.streams[i].channel.display_name,
                title: jsondata.streams[i].channel.status,
                url: jsondata.streams[i].channel.url,
                viewercount: jsondata.streams[i].viewers,
                image: jsondata.streams[i].preview.small,
                language: jsondata.streams[i].channel.language
            });
        }

        populateHTML(fullinfo);
    };

    var populateHTML = function(streaminfo) {
        var container;
        for(let i=streaminfo.length-1; i>=0; i--) {
            container = streambox.firstElementChild.children[i+1];

            container.innerHTML =
                "<a href=" + streaminfo[i].url + ">" +
                "<div class='ofp-streaminfo'><strong>" +
                streaminfo[i].title + "</strong> (" +
                streaminfo[i].language + ")<p><span>" +
                streaminfo[i].username + "</span> / <span>" +
                streaminfo[i].viewercount + "</span> viewers" + 
                "</p></div></a>";
        }
    };

    var streambox = makeSidebarBox();
    grabStreams();
}

var pippy;
function parallax() {
    pippy.style["background-position"] = "0 58px, 0 "+
        (79-window.pageYOffset*0.5)+"px";
}

window.addEventListener("load", function(){
    if(g_parallax){
        pippy = document.getElementById("header-img");

        window.addEventListener("scroll", function(){
            if(window.pageYOffset < 150) {
                window.requestAnimationFrame(parallax);
            }
        }, false);
    }

    setupGMMenu();
    makeStylesheet();

    if(g_streams) {
        Streambox();
    }

    Flairbox();
}, false);

