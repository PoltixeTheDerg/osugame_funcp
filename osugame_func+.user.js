// ==UserScript==
// @name        osugame_func+
// @namespace   /r/osugame
// @author      /u/N3G4
// @description Adds osu! related functionality to /r/osugame
// @include     *reddit.com/r/osugame*
// @version     1.5.1
// @require     https://openuserjs.org/src/libs/sizzle/GM_config.js
// @run-at      document-end
// @grant       GM_openInTab
// @grant       GM_addStyle
// @grant       GM_registerMenuCommand
// @grant       GM_getValue
// @grant       GM_setValue
// @grant       GM_log
// @grant       GM_xmlhttpRequest
// ==/UserScript==

// ~ ~~ Features ~~ ~
// * Turns URLs in user flairs to clickable links
// * Displays player name and pp/rank on flair hover
// * Adds live twitch streams to the sidebar
// * Adds song preview buttons to beatmap links
//
// ~      ~~~~      ~

var githubURL = "https://github.com/v0x76/osugame_funcp";

var g_flairs, g_streams, g_refreshstreams, g_refreshrate, g_songs, g_parallax, g_debug;

function setupConfig() {
    GM_config.init({
        "id": "ofpconf",
        "title": "osugame_func+ settings",
        "fields":
        {
            "flairs": {
                "label": "Player info fetching",
                "type": "checkbox",
                "default": true
            },

            "streams": {
                "label": "Live twitch streams",
                "type": "checkbox",
                "default": true
            },

            "refreshstreams": {
                "label": "Automatically refresh stream list",
                "type": "checkbox",
                "default": false
            },

            "refreshrate": {
                "label": "Stream list refresh rate (seconds)",
                "type": "int",
                "min": 1,
                "max": 600,
                "default": 30
            },

            "songs": {
                "label": "Add song preview button to beatmap links",
                "type": "checkbox",
                "default": true
            },

            "parallax": {
                "label": "Parallax effect in header",
                "type": "checkbox",
                "default": true
            },

            "debug": {
                "label": "Debug mode",
                "type": "checkbox",
                "default": false
            }
        },
        "css": "#ofpconf { background-color: #F6F6FE !important; }" +
            "#ofpconf .config_header { color: #369 !important; }"
    });

    g_flairs = GM_config.get("flairs");
    g_streams = GM_config.get("streams");
    g_refreshstreams = GM_config.get("refreshstreams");
    g_refreshrate = GM_config.get("refreshrate");
    g_songs = GM_config.get("songs");
    g_parallax = GM_config.get("parallax");
    g_debug = GM_config.get("debug");

    GM_registerMenuCommand("Open settings", function(){ GM_config.open(); }, "s");
    GM_registerMenuCommand("Open github repo", function(){ GM_openInTab(githubURL); }, "g");
    GM_registerMenuCommand("DL latest version of script", 
        function(){ GM_openInTab(githubURL + "/raw/master/osugame_func+.user.js"); }, "v");
}

function makeStylesheet() {
    GM_addStyle(
        "#ofpconf { border-radius: 2px !important; border-color: #DDD !important; " +
            "box-shadow: 0 3px 12px rgba(85, 85, 85, 0.1); }" +
        "#ofp-infobox { position: absolute; padding: 2px 5px; " +
            "background-color: #A9A9FF; opacity: 0.9; color: #FFF; " +
            "font-size: 11px; }" +
        "#ofp-infobox::before { content: ''; position: absolute; " +
            "bottom: -8px; font-size: 0; opacity: 0.9; " +
            "border-style: solid; border-width: 4px; " +
            "border-color: #A9A9FF transparent transparent; }" +
        ".ofp-streaminfo { width: 100%; min-height: 45px; " +
            "margin: 4px 0; padding: 2px; background: #EEF; " +
            "color: #888; }" +
        ".ofp-streaminfo img { float: left; margin-right: 4px; }" +
        ".ofp-streaminfo strong { color: #369; font-size: 12px; }" +
        ".ofp-streaminfo p { margin: 3px 0 0 !important; }" +
        ".ofp-streaminfo span { color: #333; }" +
        ".ofp-preview { cursor: pointer; font-size: 0.7em; }"
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

        var idregex = /^[0-9]+$/;
        var userid = response.finalUrl.split("/").pop();
        // need userId to grab rank data
        if(userid.search(idregex) === -1) {
            // grab from javascript variable
            userid = resdom.children[1].getElementsByTagName("script")[0]
                .innerHTML.split(";\n")[0].split("= ")[1];

            // second route
            if(userid.search(idregex) === -1) {
                // grab from avatar filename
                var avatar = resdom.getElementsByClassName("avatar-holder")[0];
                if(avatar) {
                    userid = avatar.firstChild.src.split("_")[0].split("/").pop();
                }

                // third route
                if(!avatar || userid.search(idregex) === -1) {
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
    var timer;
    var refreshing = true;

    var makeSidebarBox = function() {
        var refreshtext;
        if(g_refreshstreams) {
            refreshtext = "stop";
        } else {
            refreshtext = "refresh";
        }

        var html =
            "<div id='ofp-streambox'><h2>Live streams <sup><sup>" +
                "<a id='refreshbtn' href='javascript:void(0)'>" + refreshtext +
                "</a></sup></sup></h2>" +
            "<div id='ofp-streamone'></div><div id='ofp-streamtwo'></div>" +
            "<div id='ofp-streamthree'></div><p>" +
            "<a href='https://www.twitch.tv/directory/game/osu!'>More</a></p></div>";

        var newelement = document.createElement("div"); 
        newelement.innerHTML = html;
        var insertpoint = document.getElementsByClassName("titlebox")[0]
            .getElementsByClassName("usertext-body")[0]
            .getElementsByTagName("h2")[1];

        var inserted = insertpoint.parentNode.insertBefore(newelement, insertpoint);

        if(g_refreshstreams) {
            document.getElementById("refreshbtn")
                .addEventListener("click", function(){
                    if(refreshing) {
                        refreshing = false;
                        window.clearInterval(timer);
                        document.getElementById("refreshbtn").innerHTML = "start";
                    } else {
                        refreshing = true;
                        timer = window.setInterval(grabStreams, g_refreshrate*1000);
                        document.getElementById("refreshbtn").innerHTML = "stop";
                    }
                }, false);

            timer = window.setInterval(grabStreams, g_refreshrate*1000);
        } else {
            document.getElementById("refreshbtn")
                .addEventListener("click", grabStreams, false);
        }

        return inserted;
    };

    var grabStreams = function() {
        if(g_debug) console.count("Fetching from Twitch API");
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

            var displayedtitle;
            if(streaminfo[i].title.length > 40) {
                displayedtitle = streaminfo[i].title.substr(0, 38) + "...";
            } else {
                displayedtitle = streaminfo[i].title;
            }

            container.innerHTML =
                "<a href=" + streaminfo[i].url + ">" +
                "<div class='ofp-streaminfo'><img src=" +
                streaminfo[i].image + "/><strong title='" +
                streaminfo[i].title.replace(/'|"/g, "") + "'>" +
                displayedtitle.replace(/<|>/g, "") + "</strong> (" +
                streaminfo[i].language + ")<p><span>" +
                streaminfo[i].username + "</span> / <span>" +
                streaminfo[i].viewercount + "</span> viewers" + 
                "</p></div></a>";
        }
    };

    var streambox = makeSidebarBox();
    grabStreams();
}

function Osulinkbox() {
    var audio = new Audio();
    audio.volume = 0.45;
    var currentId = -1;

    var addPreview = function(link) {
        var element = document.createElement("a");
        element.innerHTML = " (preview)";
        element.className = "ofp-preview";

        var beatmapid = link.href.match(/[0-9]+$/)[0];

        var inserted = link.parentNode.insertBefore(element, link.nextSibling);
        inserted.addEventListener("click", function(){ 
            console.log(beatmapid);
            if(currentId == beatmapid) {
                if(audio.paused) { audio.play(); return true; }
                else { audio.pause(); audio.currentTime = 0; return false; }
            }
            currentId = beatmapid;
            audio.src = "https://b.ppy.sh/preview/" + beatmapid + ".mp3"; 
            audio.play();
            return true;
        }, false);
    };

    var entries = document.getElementsByClassName("usertext-body");
    for(let i=entries.length-1; i>=0; i--) {
        var links = entries[i].getElementsByTagName("a");

        for(let j=links.length-1; j>=0; j--) {
            if( links[j].href.search("^https?://osu\.ppy\.sh/s/") !== -1 ) {
                addPreview(links[j]);
            }
        }
    }
}

var pippy, srheader, navtop;
function parallax() {
    pippy.style["background-position"] = "0 58px, 0 "+
        (79-window.pageYOffset*0.5)+"px";

    if(window.pageYOffset < 50) {
        srheader.style["margin-top"] = -(window.pageYOffset*0.25)+"px";
        navtop.style.top = (19-window.pageYOffset*0.25)+"px";
    }
}

window.addEventListener("load", function(){
    setupConfig();
    makeStylesheet();

    if(g_streams) {
        Streambox();
    }

    if(g_songs) {
        Osulinkbox();
    }

    Flairbox();

    if(g_parallax){
        pippy = document.getElementById("header-img");
        srheader = document.getElementById("sr-header-area");
        navtop = document.getElementById("header-bottom-right");

        window.addEventListener("scroll", function(){
            if(window.pageYOffset < 150) {
                window.requestAnimationFrame(parallax);
            }
        }, false);
    }
}, false);

