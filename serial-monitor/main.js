// we can pass those variables along with window object
var bracketsPath = "/Applications/devel/Brackets.app/";
var extensionPath = "/Users/apla/work/mcu/brackets-arduino/";
var serialMonitorPath = extensionPath + "serial-monitor/";

require.config({
	baseUrl: bracketsPath + "Contents/www/",
	paths: {
		"utils/EventDispatcher":      serialMonitorPath + "utils/EventDispatcher",
		"utils/NodeConnection":       serialMonitorPath + "utils/NodeConnection",
		"utils/NodeDomain":           serialMonitorPath + "utils/NodeDomain",
		"widgets/bootstrap-dropdown": serialMonitorPath + "widgets/bootstrap-dropdown"
	}
});

/*jslint vars: true, plusplus: true, devel: true, nomen: true, indent: 4,
 * maxerr: 50, browser: true */
/*global $, define, brackets */

brackets.getModule = require;

requirejs (
	['utils/EventDispatcher', 'utils/NodeConnection', 'utils/NodeDomain', 'widgets/bootstrap-dropdown'],
	function   (EventDispatcher, NodeConnection, NodeDomain) {
		"use strict";

		var moduleId = "me.apla.brackets-cuwire.console";
		console.log (123);

		var cuwireDomain = new NodeDomain ("cuwire", extensionPath + "node/cuwireDomain.js");

		console.log (456);

		var result = cuwireDomain.exec ("echo", "789");

		result.done(function (value) {
			console.log (value);
			// the command succeeded!
		});

		result.fail(function (err) {
			// the command failed; act accordingly!
		});

		var portEnumSub = false;

		function setPort () {
//			var titleButton = $('#cuwire-panel button.cuwire-board');
//			if (this.platforms[platformName])
//				titleButton.text (boardMeta.name);
		}

		function enumerateSerialPorts () {
			// TODO: show spinner indicator

			var cuwirePortDD = $('#cuwire-panel ul.cuwire-port');
			if (!portEnumSub) {
				// can't find the working API for this
				var buttonDD = cuwirePortDD.prev("*[data-toggle=\"dropdown\"]");
				buttonDD.on ('click', function () {
					if (!buttonDD.parent ().hasClass ('open')) {
						enumerateSerialPorts ();
					}
				});
				//			cuwirePortDD.prev().on ('show.bs.dropdown', function () {
				//				console.log (123);
				//			});
				portEnumSub = true;
			}

			$('<li><a href="#">Updating</a></li>').appendTo(cuwirePortDD);

			cuwireDomain.exec("enumerateSerialPorts")
			.done(function (ports) {
				// TODO: get last used port from preference manager
				// TODO: show warning indicator
				// user must select port prior to launch
				console.log(
					"[brackets-cuwire-node] Available ports:",
					ports.map (function (port) {return port})
				);
				cuwirePortDD.empty ();
				// tr = $('<tr />').appendTo('#cuwire-panel tbody');

				ports.forEach (function (port) {
					$('<li><a href="#">'+port.name+"</a></li>")
					.on ('click', setPort.bind (this, port))
					.appendTo(cuwirePortDD);
				});

				//		$('<td />').text(err.message).appendTo(tr);
				//		$('<td />').text(err.filename).appendTo(tr);
				setPort ();
			}).fail(function (err) {
				// TODO: show error indicator
				console.error("[brackets-cuwire-node] failed to run cuwire.enumerateSerialPorts, error:", err);
			});

		}

		enumerateSerialPorts();
});
