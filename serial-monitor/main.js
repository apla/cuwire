// we can pass those variables along with window object

var serialMonitorPath = decodeURIComponent (location.pathname).replace ('index.html', "");
var extensionPath     = serialMonitorPath.replace ("serial-monitor/", "");

if (navigator.platform === "Win32") {
	extensionPath = extensionPath.replace (/^\/([A-Z])\:/, "$1:")
}

require.config({
	baseUrl: bracketsWwwPath,
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

uiHandler ();

brackets.getModule = require;

requirejs (
	['utils/EventDispatcher', 'utils/NodeConnection', 'utils/NodeDomain', 'widgets/bootstrap-dropdown'],
	function   (EventDispatcher, NodeConnection, NodeDomain) {
		"use strict";

		var moduleId = "me.apla.brackets-cuwire.console";
		var cuwireDomain = new NodeDomain ("cuwire", extensionPath + "node/cuwireDomain.js");

		var portEnumSub = false;

		var currentPort;

		function setPort (port) {

			var titleButton = document.querySelector ('#cuwire-panel button.cuwire-port');
			if (port) {
				currentPort = port;
			}

			if (currentPort) {
				titleButton.textContent = currentPort.name.replace (/^\/dev\/(cu\.)?/, "");
			} else {
				titleButton.textContent = "Port";
			}
		}

		// TODO: fill baudrate list
		var baudratesLi = [].slice.apply (document.querySelectorAll ('#cuwire-panel ul.cuwire-baudrate li'));
		baudratesLi.forEach (function (li) {
			li.addEventListener ('click', function (evt) {
				setBaudRate (parseInt (evt.target.textContent));
			}, false);
		});

		var currentBaudrate;

		function setBaudRate (baudrate) {
//			console.log (baudrate);
			var titleButton = document.querySelector ('#cuwire-panel button.cuwire-baudrate');

			if (baudrate) {
				titleButton.textContent = baudrate;
				currentBaudrate = baudrate;
			} else {
				titleButton.textContent = "Baudrate";
			}
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

			var connectButton = document.querySelector ('button.cuwire-com-connect');

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
					if (port.name === window.location.qs.serialPort) {
						setPort (port);
					}
					if (port.connected) {
						connectButton.textContent = "Disconnect";
					}
				});

//				console.log (port.name, window.location.qs.serialPort);


				//		$('<td />').text(err.message).appendTo(tr);
				//		$('<td />').text(err.filename).appendTo(tr);
				setPort ();
			}).fail(function (err) {
				// TODO: show error indicator
				console.error("[brackets-cuwire-node] failed to run cuwire.enumerateSerialPorts, error:", err);
			});

			var preNode = document.querySelector ('.log-wrapper pre');

			cuwireDomain.on ('serialMessage', function (event, message) {

				preNode.textContent += message;
				setTimeout (function () {
					preNode.parentElement.scrollTop = preNode.parentElement.scrollHeight;
				}, 0);

			});

			connectButton.addEventListener ('click', function () {
				if (connectButton.textContent === "Disconnect") {
					cuwireDomain.exec ("closeSerialPort", [
						currentPort
					]).done (function (ports) {
						connectButton.textContent = "Connect";
					}).fail(function (err) {
						// TODO: show error indicator
						console.error("[brackets-cuwire-node] failed to run cuwire.openSerialPort, error:", err);
					});
					return;
				}
				cuwireDomain.exec ("openSerialPort", [
					currentPort,
					currentBaudrate
				]).done (function (ports) {
					connectButton.textContent = "Disconnect";
				}).fail (function (err) {
					// TODO: show error indicator
					console.error("[brackets-cuwire-node] failed to run cuwire.openSerialPort, error:", err);
				});

			}, false);

			var sendButton = document.querySelector ('button.cuwire-com-send');
			sendButton.addEventListener ('click', function () {
				var commandText = sendButton.previousElementSibling.value;
				cuwireDomain.exec ("sendMessageSerial", [
					currentPort,
					commandText
				]).done (function () {

				}).fail (function (err) {
					// TODO: show error indicator
					console.error("[brackets-cuwire-node] failed to run cuwire.sendMessageSerial, error:", err);
				});
			}, false);
		}

		enumerateSerialPorts();
});

function getAbsoluteHeight(el) {
	// Get the DOM Node if you pass in a string
	el = (typeof el === 'string') ? document.querySelector(el) : el;

	var styles = window.getComputedStyle(el);
	var margin = parseFloat(styles['marginTop']) +
		parseFloat(styles['marginBottom']);

	return Math.ceil(el.offsetHeight + margin);
}

var resizeTimeoutId;

function resizeUI () {
	var occupiedHeight = getAbsoluteHeight ('h3') + getAbsoluteHeight ('#cuwire-console');
	var logWrapper = document.querySelector ('.log-wrapper');
	// 2 is border height
	logWrapper.style.height = (window.innerHeight - occupiedHeight - 2) + "px";
}

function onWindowResize(e) {
	clearTimeout (resizeTimeoutId);
	resizeTimeoutId = window.setTimeout (resizeUI, 10);
}

function uiHandler () {
	var controlsHeight;
	window.addEventListener ('resize', onWindowResize);
	resizeUI();
}
