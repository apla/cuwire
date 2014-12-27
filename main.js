/*jslint vars: true, plusplus: true, devel: true, nomen: true, indent: 4,
maxerr: 50, browser: true */
/*global $, define, brackets */

define(function (require, exports, module) {
	"use strict";

	var moduleId = "me.apla.brackets-arduino";

	var ExtensionUtils     = brackets.getModule("utils/ExtensionUtils"),
		NodeDomain         = brackets.getModule("utils/NodeDomain"),
		PreferencesManager = brackets.getModule("preferences/PreferencesManager"),
		Dialogs            = brackets.getModule("widgets/Dialogs"),
	    DocumentManager    = brackets.getModule("document/DocumentManager"),
		ProjectManager     = brackets.getModule("project/ProjectManager"),
		WorkspaceManager   = brackets.getModule('view/WorkspaceManager');



	var prefs = PreferencesManager.getExtensionPrefs (moduleId);

//	prefs.definePreference ("board", "object", {});
//	prefs.definePreference ("port", "string", null);

	var stateManager = PreferencesManager.stateManager.getPrefixedSystem (moduleId);

//	prefs.definePreference ("panelVisible", "boolean", false);

//	prefs.definePreference ("patterns", "array", []).on("change", function () {
//	});

	var arduinoDomain = new NodeDomain("arduino", ExtensionUtils.getModulePath(module, "node/ArduinoDomain"));
	ExtensionUtils.loadStyleSheet(module, "assets/style.css");

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

		var arduinoPortDD = $('#arduino-panel ul.arduino-port');
		if (!this.portsDDSubscribed) {
			// can't find the working API for this
			var buttonDD = arduinoPortDD.prev("*[data-toggle=\"dropdown\"]");
			buttonDD.on ('click', function () {
				if (!buttonDD.parent ().hasClass ('open')) {
					self.enumerateSerialPorts ();
				}
			});
//			arduinoPortDD.prev().on ('show.bs.dropdown', function () {
//				console.log (123);
//			});
			this.portsDDSubscribed = true;
		}

		$('<li><a href="#">Updating</a></li>').appendTo(arduinoPortDD);

		this.domain.exec("enumerateSerialPorts")
		.done(function (ports) {
			// TODO: get last used port from preference manager
			// TODO: show warning indicator
			// user must select port prior to launch
			console.log(
				"[brackets-arduino-node] Available ports:",
				ports.join (", ")
			);
			arduinoPortDD.empty ();
			// tr = $('<tr />').appendTo('#arduino-panel tbody');


			ports.forEach (function (portName) {
				$('<li><a href="#">'+portName+"</a></li>")
				.on ('click', self.setPort.bind (self, portName))
				.appendTo(arduinoPortDD);
			});

			//		$('<td />').text(err.message).appendTo(tr);
			//		$('<td />').text(err.filename).appendTo(tr);
			self.setPort ();
		}).fail(function (err) {
			// TODO: show error indicator
			console.error("[brackets-arduino-node] failed to run arduino.enumerateSerialPorts, error:", err);
		});

	}

	ArduinoExt.prototype.setPort = function (portName) {
		// TODO: set port in preferences
		if (!portName) {
			portName = prefs.get ('port');
			// no preference, first launch
			if (!portName)
				return;
		} else {
			prefs.set ('port', portName);
		}
		$('#arduino-panel button.arduino-port').text (portName.replace (/^\/dev\/cu\./, ""));
	}

	ArduinoExt.prototype.showBoardImage = function (boardId, platformName) {
		console.log ("board image", boardId, platformName, this.boardImage);
		if (boardId) {
			throw "unexpected boardId, not implemented yet";
		}

		var message = "<h3>No board image found</h3>";
		if (this.board.image) {
			message = '<img src="'+this.board.imageUrl+'"/>';
		}

		Dialogs.showModalDialog (
			'cuwire-board-image',
			this.board.name, // title
			message // dialog body
			// buttons, by default ok button
			// autodismiss, true by default
		).done (function (buttonId) {
			if (buttonId === "ok") {
				// CommandManager.execute("debug.refreshWindow");
			}
		});
	}

	ArduinoExt.prototype.setBoard = function (boardId, platformName, boardMod) {
		// TODO: set board in preferences
		if (!boardId) {
			var boardPref = prefs.get ('board');
			// no preference, first launch
			if (!boardPref)
				return;
			boardId = boardPref[0];
			platformName = boardPref[1];
		} else {
			prefs.set ('board', [boardId, platformName, boardMod]);
		}

		var self = this;
		var boardMeta = this.platforms[platformName].boards[boardId];
		var boardImageUrl = require.toUrl ('./assets/board-images/'+boardId+'.jpg');

		this.board = {
			id:    boardId,
			meta:  boardMeta,
			name:  boardMeta.name,
			image: null,
			imageUrl: boardImageUrl
		};

		var titleButton = $('#arduino-panel button.arduino-board');
		if (this.platforms[platformName])
			titleButton.text (boardMeta.name);

		var fs = brackets.getModule("filesystem/FileSystem");
		var fileObj = fs.getFileForPath (boardImageUrl);

		fileObj.exists (function (err, exists) {
			if (err || !exists)
				return;
			var bi = new Image ();
			bi.addEventListener ('load',  function () {
				console.log ('load done', arguments);
				self.board.image = bi;
			}, false);
			bi.addEventListener ('error', function () {
				console.log ('load error', arguments);
			}, false);
			bi.addEventListener ('abort', function () {
				console.log ('load abort', arguments);
			}, false);
			bi.src = encodeURI (boardImageUrl);
		})

	}

	function getFormFields (formEl) {
		var formData = {};
		for (var i = 0; i < formEl.elements.length; i ++) {
			var formField = formEl.elements[i];
			if ((formField.type === 'radio' && formField.checked) || formField.type !== 'radio') {
				formData[formField.name] = formField.value;
			}
		}
		return formData;
	}

	ArduinoExt.prototype.selectBoardMod = function (boardId, platformName) {
		var boardMeta = this.platforms[platformName].boards[boardId];
		if (!("menu" in boardMeta)) {
			this.setBoard (boardId, platformName);
			return;
		}

		// WTF: mustache doesn't support iteration over object keys
		var message = "<h3>Select:</h3><form id=\"cuwire-board-mod\">";
		for (var modType in boardMeta.menu) {
			// variants.push (modType+':');
			var submenu = "<fieldset><p>"+modType+"</p>";
			var idx = 0;
			for (var mod in boardMeta.menu[modType]) {
				// variants.push (boardMeta.menu[modType][mod].[modType + "_modification"]);
				submenu += "<div><input type=\"radio\" id=\""+modType+mod+"\" name=\""+modType+"\" value=\""+mod+"\""+(idx === 0 ? " checked" : "")+"><label for=\""+modType+mod+"\">" + boardMeta.menu[modType][mod][modType + "_modification"] + "</label></div>";
				idx ++;
			}
			message += submenu + '</fieldset>';
		}
		message += "</form>";

		var formData = {};

		var dlg = Dialogs.showModalDialog (
			'cuwire-board-mod',
			boardMeta.name + ' modifications:', // title
			message, // dialog body
			null, // buttons, by default ok button
			true // autodismiss, true by default
		).done ((function (buttonId) {
			if (buttonId === "ok") {
				var formEl = document.getElementById ("cuwire-board-mod");
				console.log (formData);
				// CommandManager.execute("debug.refreshWindow");
				var boardMod = {};
				for (var modType in boardMeta.menu) {
					boardMod[modType] = formData[modType];
					if (!boardMod[modType]) {
						console.error ('board modification', modType, 'not defined, continue with caution');
					}
				}
				this.setBoard (boardId, platformName, boardMod);
			}
		}).bind (this));

		var boardModInputs = $("#cuwire-board-mod input");
		// WTF: there is little delay between actual rendering and request to create an dom nodes
		// setTimeout (function () {
			boardModInputs = $("#cuwire-board-mod input");
			var formEl = boardModInputs[0].form;
			formData = getFormFields (formEl);
		// }, 100);

		// WTF: brackets have no option to prevent dialog close
		// I can use autodismiss: false, but this is not works, really
		// WTF: also, you can't do anything with app with modal window open. even quit app!!!


		boardModInputs.change (function() {
			var formEl = $(this)[0].form;
			formData = getFormFields (formEl);
			// console.log (formData);
			// console.log ($(this).attr('name'), $(this).attr('value'));
		});


	}

	ArduinoExt.prototype.getBoardMeta = function () {
		// TODO: show spinner indicator

		var self = this;

		// TODO: author's module location - use preferences for this
		// TODO: when we can't find arduino ide in default locations gracefully degrade
		this.domain.exec("getBoardsMeta", ["/Applications/devel/Arduino.app"])
		.done(function (platforms) {
			console.log("[brackets-arduino-node] Available boards:");

			self.platforms = platforms;

			$('#arduino-panel ul.arduino-board li').remove();
			// tr = $('<tr />').appendTo('#arduino-panel tbody');
			var arduinoBoardDD = $('#arduino-panel ul.arduino-board');

			console.log (Object.keys (platforms));

			Object.keys (platforms).sort().forEach (function (platformName) {
				console.log (platformName);
				$('<li class="dropdown-header">'
				  + platforms[platformName].platform.name + " "
				  + platforms[platformName].platform.version
				  + "</li>").appendTo(arduinoBoardDD);

				var boards = platforms[platformName].boards;
				Object.keys (boards).sort().map (function (boardId) {
					var boardMeta = boards[boardId];

					var boardItem = $('<li><a href="#">'+boardMeta.name+"</a></li>");
					boardItem.appendTo(arduinoBoardDD);
					boardItem.on ('click', self.selectBoardMod.bind (self, boardId, platformName));

					var boardDesc = boardMeta.name + ' (' + boardId
					if ("menu" in boardMeta) {
						boardDesc += ', modifications: ';
						var variants = [];
//						boardItem.addClass ('dropdown-submenu');
//						var submenu = $("<ul class=\"dropdown-menu\">");
						for (var modType in boardMeta.menu) {
							variants.push (modType+':');
							for (var mod in boardMeta.menu[modType]) {
								variants.push (boardMeta.menu[modType][mod][modType + "_modification"]);
//								submenu.append ($("<li><a href=\"#\">" + boardMeta.menu.cpu[cpuVariant].cpu_modification + "</a></li>"));
							}
						}

						// boardItem.append (submenu);

						boardDesc += variants.join (" ");

					}
					boardDesc += ')';
					console.log (boardDesc);


				});
			});
			self.setBoard();
		}).fail(function (err) {
			// TODO: show error indicator
			console.error("[brackets-arduino-node] failed to run arduino.getBoardMeta, error:", err);
		});

	}

	function percentageDegrees (p) {
		p = (p >= 100 ? 100 : p);
		var d = 3.6 * p;
		return d;
	};

	function createGradient (elemPie, elemValue, elemMax, value, max) {
		var p = Math.round (value / (max || value) * 100);
		var d = percentageDegrees (p);
		if (d <= 180) {
			d = 90 + d;
			elemPie.css ('background', 'linear-gradient(90deg, #2c3e50 50%, transparent 50%), linear-gradient('+ d +'deg, #2ecc71 50%, #2c3e50 50%)');
		} else {
			d = d - 90;
			elemPie.css ('background', 'linear-gradient(-90deg, #2ecc71 50%, transparent 50%), linear-gradient('+ d +'deg, #2c3e50 50%, #2ecc71 50%)');
		}
		elemPie.attr ('data-percentage', p);
		elemPie.text (p + '%');
		elemValue.text (value);
		elemMax.text (max || 'n/a');
	}


	ArduinoExt.prototype.compileOrUpload = function (mode) {
		var boardMeta = prefs.get ('board');
		var boardId = boardMeta[0];
		var platformName = boardMeta[1];
		var boardMod  = boardMeta[2];
		var options = {};

		if (mode === 'upload') {
			options.serial = {
				port: prefs.get ('port')
			};
		}

		options.includes = prefs.get ('includes');


		var currentDoc = DocumentManager.getCurrentDocument();

		var fullPath = currentDoc.file.fullPath;

		var processStateDiv = $('#arduino-panel .process-state');
		processStateDiv.removeClass ();
		processStateDiv.addClass ('process-state span2 running');

		// cleanup log before next compile
		$('#arduino-panel .table-container table tbody tr').remove();

		this.findSketchFolder ((function (err, folder) {

			this.domain.exec (mode, [
				folder,
				platformName,
				boardId,
				boardMod || {},
				options || {}
			])
			.done (function (size) {
				console.log (size);

				processStateDiv.removeClass ();
				processStateDiv.addClass ('process-state span2 success');

			}).fail (function (error) {
				processStateDiv.removeClass ();
				processStateDiv.addClass ('process-state span2 failure');
				console.log (error);
			});
		}).bind (this));
	}

	function getRelativeFilename(basePath, filename) {
		if (!filename || filename.substr(0, basePath.length) !== basePath) {
			return;
		}

		return filename.substr(basePath.length);
	}

	ArduinoExt.prototype.findSketchFolder = function (cb) {
		var error;
		ProjectManager.getAllFiles (function (fileName) {
			// searching for ino/pde only
			if (fileName.fullPath.match (/\.(ino|pde)$/))
				return true;
			return false;
		}).done (function (fileList) {

			if (!fileList.length) {
				error = 'cannot find .ino or .pde files within current project';
				cb (error);
				return;
			}

			// only one sketch within project dir, do it!
			if (fileList.length === 1) {
				var sketchFolderPath = fileList[0].parentPath;
				cb (null, sketchFolderPath);
				return;
			}

			var projectRoot = ProjectManager.getProjectRoot();

			// selected file and current document can be different, so check context for both
			var selectedFile = ProjectManager.getSelectedItem();
			var selectedFilePath = selectedFile.fullPath;
			var currentDoc   = DocumentManager.getCurrentDocument();
			var openedFile   = currentDoc.file;
			var openedFilePath = openedFile.fullPath;

			console.log (getRelativeFilename (projectRoot.fullPath, selectedFile.fullPath, openedFile.fullPath));

			var currentSketchFolder;

			fileList.every (function (inoFile) {
				var sketchFolderPath = inoFile.parentPath;

				if (openedFile && getRelativeFilename (sketchFolderPath, openedFilePath)) {
					currentSketchFolder = sketchFolderPath;
					return false;
				} else if (selectedFile && getRelativeFilename (sketchFolderPath, selectedFilePath)) {
					currentSketchFolder = sketchFolderPath;
					return false;
				}
				return true;
			});

			if (currentSketchFolder) {
				// we have selected or opened file somewhere within sketch tree
				cb (null, currentSketchFolder);
				return;
			}

			// TODO: draw a dialog with buttons to handle this
			var message = "<p>Our microcontroller cannot distinguish between available sketches displayed below. "
			+"Please do it manually. We don\'t store your selection because path to the sketch file can be bigger "
			+"than available memory. Sorry!</p><div class=\"btn-group btn-group-vertical\">";
			message += fileList.sort().map (function (fileObject, fileObjectIdx) {
				var sketchFolderPath = fileObject.parentPath.replace (/\/$/, "");
				return [
					'<button data-button-id="cuwire-sketch-',
					fileObjectIdx,
					'" class="dialog-button btn btn-large input-block-level">',
					getRelativeFilename (projectRoot.fullPath, sketchFolderPath),
					'</button>'
				].join ('');
			}).join ('');
			message += '</div>';

			Dialogs.showModalDialog (
				"cuwire-sketch-select",
				"Please select sketch:",
				message
			).done(function (buttonId) {
				var buttonMatch = buttonId.match (/cuwire-sketch-(\d+)/);
				if (!buttonMatch) {
					// don't care about another buttons
					return;
				}

				var sketchIdx = parseInt (buttonMatch[1]);

				cb (null, fileList[sketchIdx].parentPath);

			});

		});

	}

	ArduinoExt.prototype.upload = function () {
		var boardMeta = prefs.get ('board');
		var boardId = boardMeta[0];
		var platformName = boardMeta[1];
		var boardMod = boardMeta[2];
		var options = {
			serial: {
				port: prefs.get ('port')
			}
		};

		this.domain.exec ("upload", [
			folder,
			platformName,
			boardId,
			boardMod || {},
			options || {}
		])
		.done(function (size) {

		}).fail (function (error) {
			processStateDiv.removeClass ();
			processStateDiv.addClass ('process-state span2 failure');
			console.log (error);
		});

	}

	ArduinoExt.prototype.createUI = function (require) {

		var myIcon = $("<a href=\"#\" id=\"arduino-sidebar-icon\"></a>");

		myIcon.appendTo($("#main-toolbar .buttons"));

		this.panel = WorkspaceManager.createBottomPanel (moduleId+".panel", $(require('text!bottom-panel.html')));

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
		// we call toggle because you cannot click on close button on hidden panel
		$('#arduino-panel .close').on('click', this.panel.toggle.bind (this.panel));

		var titleButton = $('#arduino-panel button.arduino-board');
		titleButton.on ('click', this.showBoardImage.bind (this, null, null));

		var compileButton = $('#arduino-panel button.arduino-compile');
		compileButton.on ('click', this.compileOrUpload.bind (this, "compile"));

		var uploadButton = $('#arduino-panel button.arduino-upload');
		uploadButton.on ('click', this.compileOrUpload.bind (this, "upload"));

		$(this.domain).on ('log', function (event, scope, message, payload) {
//			console.log (message);

			var highlight = '';
			if (payload && payload.stderr) {
				highlight = 'error';
			} else if (payload && payload.maxText) {
//				var textSizeP = Math.round (payload.text / payload.maxText * 100);
				createGradient ($('.pie.pie-text'), $('.pie-label.pie-text .value'), $('.pie-label.pie-text .full'), payload.text, payload.maxText);
//				var dataSizeP = Math.round (payload.data / (payload.maxData || payload.data) * 100);
				createGradient ($('.pie.pie-data'), $('.pie-label.pie-data .value'), $('.pie-label.pie-data .full'), payload.data, payload.maxData);
				// createGradient ($('.pie-eeprom'), percentageDegrees (0), 0);

			} else if (message.match (/^done(?:\s|$)/)) {
				highlight = 'done';
			}

			$('#arduino-panel .table-container table tbody').append ("<tr class=\""+highlight+"\"><td>"+scope+"</td><td>"+message+"</td></tr>");
			var rowpos = $('#arduino-panel .table-container table tbody tr:last').position();

			// TODO: fix scroll
			// http://stackoverflow.com/questions/1805808/how-do-i-scroll-a-row-of-a-table-into-view-element-scrollintoview-using-jquery
			// $('#container').scrollTop( $('#tr').offset().top - $('#td').offset().top )
			$('#arduino-panel .table-container').scrollTop(rowpos.top);
		});
	}


	app.appReady(function(){
		//		$(brackets.getModule('document/DocumentManager')).on('documentSaved', onDocumentSaved);

		var arduinoExt = new ArduinoExt (require, arduinoDomain);
	});

});
