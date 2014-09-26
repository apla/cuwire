/*jslint vars: true, plusplus: true, devel: true, nomen: true, indent: 4,
maxerr: 50, browser: true */
/*global $, define, brackets */

define(function (require, exports, module) {
	"use strict";

	var ExtensionUtils = brackets.getModule("utils/ExtensionUtils"),
		NodeDomain     = brackets.getModule("utils/NodeDomain");

	var arduinoDomain = new NodeDomain("arduino", ExtensionUtils.getModulePath(module, "node/ArduinoDomain"));
	ExtensionUtils.loadStyleSheet(module, "style.css");

	function ArduinoExt (require, domain) {
		this.domain = domain;
		this.createUI (require);
	}

	var app = brackets.getModule('utils/AppInit');

	ArduinoExt.prototype.loadNodePart = function () {

	}

	ArduinoExt.prototype.enumerateSerialPorts = function () {
		// TODO: show spinner indicator

		this.domain.exec("enumerateSerialPorts", false)
		.done(function (ports) {
			// TODO: get last used port from preference manager
			// TODO: show warning indicator
			// user must select port prior to launch
			console.log(
				"[brackets-arduino-node] Available ports:",
				ports.join (", ")
			);
			$('#arduino-panel ul.arduino-port li').remove();
			// tr = $('<tr />').appendTo('#arduino-panel tbody');
			var arduinoPortDD = $('#arduino-panel ul.arduino-port');

			ports.forEach (function (portName) {
				$('<li><a href="#">'+portName+"</a></li>").appendTo(arduinoPortDD);
			});

			//		$('<td />').text(err.message).appendTo(tr);
			//		$('<td />').text(err.filename).appendTo(tr);
		}).fail(function (err) {
			// TODO: show error indicator
			console.error("[brackets-arduino-node] failed to run arduino.enumerateSerialPorts", err);
		});

	}

	ArduinoExt.prototype.createUI = function (require) {

		var myIcon = $("<a href=\"#\" id=\"arduino-sidebar-icon\"></a>");

		myIcon.appendTo($("#main-toolbar .buttons"));

		var PanelManager = brackets.getModule('view/PanelManager');
		this.panel = PanelManager.createBottomPanel("Arduino", $(require('text!bottom-panel.html')));

		this.enumerateSerialPorts ();

		myIcon.on ("click", this.panel.show.bind (this.panel));
		$('#arduino-panel .close').on('click', this.panel.hide.bind (this.panel));

	}


	app.appReady(function(){
		//		$(brackets.getModule('document/DocumentManager')).on('documentSaved', onDocumentSaved);

		var arduinoExt = new ArduinoExt (require, arduinoDomain);
	});

});
