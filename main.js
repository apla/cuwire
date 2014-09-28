/*jslint vars: true, plusplus: true, devel: true, nomen: true, indent: 4,
maxerr: 50, browser: true */
/*global $, define, brackets */

define(function (require, exports, module) {
	"use strict";

	var moduleId = "me.apla.brackets-arduino";

	var ExtensionUtils = brackets.getModule("utils/ExtensionUtils"),
		NodeDomain     = brackets.getModule("utils/NodeDomain"),
		PreferencesManager = brackets.getModule("preferences/PreferencesManager");

	var prefs = PreferencesManager.getExtensionPrefs (moduleId);

//	prefs.definePreference ("board", "object", {});
//	prefs.definePreference ("port", "string", null);

	var stateManager = PreferencesManager.stateManager.getPrefixedSystem (moduleId);

//	prefs.definePreference ("panelVisible", "boolean", false);

//	prefs.definePreference ("patterns", "array", []).on("change", function () {
//	});

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

		var self = this;

		this.domain.exec("enumerateSerialPorts")
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
				$('<li><a href="#">'+portName+"</a></li>")
				.on ('click', self.setPort.bind (self, portName))
				.appendTo(arduinoPortDD);
			});

			//		$('<td />').text(err.message).appendTo(tr);
			//		$('<td />').text(err.filename).appendTo(tr);
		}).fail(function (err) {
			// TODO: show error indicator
			console.error("[brackets-arduino-node] failed to run arduino.enumerateSerialPorts, error:", err);
		});

	}

	ArduinoExt.prototype.setPort = function (portName) {
		// TODO: set port in preferences
		$('#arduino-panel button.arduino-port').text (portName.replace (/^\/dev\/cu\./, ""));
	}

	ArduinoExt.prototype.setBoard = function (boardId, platformName) {
		// TODO: set board in preferences
		$('#arduino-panel button.arduino-board').text (this.platforms[platformName].boards[boardId].name);
	}

	ArduinoExt.prototype.getBoardMeta = function () {
		// TODO: show spinner indicator

		var self = this;

		this.domain.exec("getBoardsMeta", ["/Users/apla/Documents/Arduino"])
		.done(function (platforms) {
			console.log("[brackets-arduino-node] Available boards:");

			self.platforms = platforms;

			$('#arduino-panel ul.arduino-board li').remove();
			// tr = $('<tr />').appendTo('#arduino-panel tbody');
			var arduinoBoardDD = $('#arduino-panel ul.arduino-board');

			Object.keys (platforms).forEach (function (platformName) {
				console.log (platformName);
				$('<li class="dropdown-header">'
				  + platforms[platformName].platform.name + " "
				  + platforms[platformName].platform.version
				  + "</li>").appendTo(arduinoBoardDD);

				var boards = platforms[platformName].boards;
				Object.keys (boards).map (function (boardId) {
					var boardMeta = boards[boardId];

					var boardItem = $('<li><a href="#">'+boardMeta.name+"</a></li>");
					boardItem.appendTo(arduinoBoardDD);
					boardItem.on ('click', self.setBoard.bind (self, boardId, platformName))

					var boardDesc = boardMeta.name + ' (' + boardId
					if ("menu" in boardMeta) {
						boardDesc += ', variants: ';
						var variants = [];
						boardItem.addClass ('dropdown-submenu');
						var submenu = $("<ul class=\"dropdown-menu\">");
						for (var cpuVariant in boardMeta.menu.cpu) {
							variants.push (boardMeta.menu.cpu[cpuVariant].cpu_variant_name);
							submenu.append ($("<li><a href=\"#\">" + boardMeta.menu.cpu[cpuVariant].cpu_variant_name + "</a></li>"));
						}

						boardItem.append (submenu);

						boardDesc += variants.join (",");

					}
					boardDesc += ')';
					console.log (boardDesc);


				});
			});

		}).fail(function (err) {
			// TODO: show error indicator
			console.error("[brackets-arduino-node] failed to run arduino.getBoardMeta, error:", err);
		});

	}

	ArduinoExt.prototype.createUI = function (require) {

		var myIcon = $("<a href=\"#\" id=\"arduino-sidebar-icon\"></a>");

		myIcon.appendTo($("#main-toolbar .buttons"));

		var PanelManager = brackets.getModule('view/PanelManager');
		this.panel = PanelManager.createBottomPanel(moduleId+".panel", $(require('text!bottom-panel.html')));

		this.enumerateSerialPorts ();
		this.getBoardMeta ();

		this.panel.toggle = function () {
			if (this.isVisible ()) {
				this.hide ();
			} else {
				this.show ();
			}
			stateManager.set ('panelVisibility', this.isVisible());
		}

		var lastPanelState = stateManager.get ('panelVisibility');
		this.panel.setVisible (lastPanelState);

		myIcon.on ("click", this.panel.toggle.bind (this.panel));
		$('#arduino-panel .close').on('click', this.panel.hide.bind (this.panel));

	}


	app.appReady(function(){
		//		$(brackets.getModule('document/DocumentManager')).on('documentSaved', onDocumentSaved);

		var arduinoExt = new ArduinoExt (require, arduinoDomain);
	});

});
