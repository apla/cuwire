define(function (require, exports, module) {
	"use strict";

	var EditorManager       = brackets.getModule("editor/EditorManager"),
		ExtensionUtils      = brackets.getModule("utils/ExtensionUtils"),
		NodeDomain          = brackets.getModule("utils/NodeDomain"),
		QuickOpen           = brackets.getModule("search/QuickOpen"),
		CSSUtils            = brackets.getModule("language/CSSUtils"),
		DocumentManager     = brackets.getModule("document/DocumentManager"),
		StringMatch         = brackets.getModule("utils/StringMatch"),
		CodeHintManager	    = brackets.getModule('editor/CodeHintManager'),
		LanguageManager     = brackets.getModule("language/LanguageManager"),
		ProjectManager      = brackets.getModule("project/ProjectManager"),
		Async               = brackets.getModule("utils/Async"),
		MultiRangeInlineEditor = brackets.getModule ("editor/MultiRangeInlineEditor").MultiRangeInlineEditor,
		Commands            = brackets.getModule('command/Commands'),
		CommandManager      = brackets.getModule('command/CommandManager');

	var ClangDomain = new NodeDomain ("clang", ExtensionUtils.getModulePath (module, "node/clang-domain.js"));

	function Clang (require, domain) {
//		this.domain = domain;
//		this.createUI (require);
	}

	var app = brackets.getModule('utils/AppInit');
	var theClang;

	app.appReady(function(){
		//		$(brackets.getModule('document/DocumentManager')).on('documentSaved', onDocumentSaved);

		var theClang = new Clang (require, ClangDomain);

		console.log ("clang ready");
	});

	/**
	* Return the token string that is at the specified position.
	*
	* @param hostEditor {!Editor} editor
	* @param {!{line:number, ch:number}} pos
	* @return {functionName: string, reason: string}
	*/
	function _getFunctionName(hostEditor, pos) {
		var token = hostEditor._codeMirror.getTokenAt(pos, true);

		// If the pos is at the beginning of a name, token will be the
		// preceding whitespace or dot. In that case, try the next pos.
		if (!/\S/.test(token.string) || token.string === ".") {
			token = hostEditor._codeMirror.getTokenAt({line: pos.line, ch: pos.ch + 1}, true);
		}

		// Return valid function expressions only (function call or reference)
		if (!((token.type === "variable") ||
			  (token.type === "variable-2") ||
			  (token.type === "property"))) {
			return {
				functionName: null,
				reason: "not a function"
			};
		}

		return {
			functionName: token.string,
			reason: null
		};
	}

	function matchFunctionNamesClang (files, functionName) {
		var result = new $.Deferred();

		var foundFunctions = [];

		Async.doInParallel(files, function (fileInfo) {
			var oneResult = new $.Deferred();

			DocumentManager.getDocumentForPath (fileInfo.fullPath).done (function (doc) {
//				console.log (doc);
				var text = doc.getText();
				var funcs = extractFunctions (text);
				funcs.forEach (function (func) {
					if (func.functionName === functionName) {
						foundFunctions.push ({
							path: fileInfo.fullPath,
							name: functionName,
							document: doc,
							func: func,
							lineStart: func.lineFrom,
							// TODO: use static analyzer tool
							lineEnd:   func.lineFrom + 2// func.lineEnd,
						});
					}
				});
			}).always(function (error) {
				// If one file fails, continue to search
				oneResult.resolve();
			});

			return oneResult.promise();
		}).always(function () {
			//			https://github.com/adobe/brackets/blob/6affa7907fdc820f7b9083bc0ff7c9fb87fb3e57/src/language/JSUtils.js
			result.resolve(foundFunctions);
		});
		return result.promise();
	}

	function functionEnd (text, codeMirror, offset) {
//		console.log (CodeMirror, CodeMirror.constructor);
		var mode = CodeMirror.getMode(CodeMirror.defaults, "clike");
		function splitLines(string){ var splits = string.split(/(\r?\n|\r)/); return splits;};
		var lines = splitLines(text);
		var state = CodeMirror.startState(mode);
		var bracketCount = 0;

		var currentOffset = 0;

		for (var i = 0, e = lines.length; i < e; ++i) {
//			if (i) callback("\n");
			if (i % 2 === 1) {
				currentOffset += lines[i].length;
				continue;
			}
			var stream = new CodeMirror.StringStream(lines[i]);
//		var stream = new CodeMirror.StringStream(text);

		if (!stream.string && mode.blankLine) mode.blankLine(state);
		while (!stream.eol()) {
			var style = mode.token(stream, state);
			if ((currentOffset + stream.pos) >= offset) {
				if (stream.current() === '{') bracketCount ++;
				if (stream.current() === '}') bracketCount --;
				if (bracketCount === 0) {
					return currentOffset + stream.start
				}
			}
//			if (!stream.current().match (/^\s+$/m)) {
//				console.log("token", stream.current(), '=>', style, stream.start, stream.pos)// mode, state);
//			}
			stream.start = stream.pos;
		}
			currentOffset += lines[i].length;
		}
		return currentOffset + stream.pos
	}

	function SourceDeclaration () {

	}

	SourceDeclaration.prototype.forQuickEdit = function (functionName) {

	}

	SourceDeclaration.prototype.forQuickEdit = function (functionName) {

	}

	function matchFunctionNamesAsync (files, functionName, codeMirror) {
		var result = new $.Deferred();

		var foundFunctions = [];

		Async.doInParallel(files, function (fileInfo) {
			var oneResult = new $.Deferred();

			DocumentManager.getDocumentForPath (fileInfo.fullPath).done (function (doc) {
//				var langObj = LanguageManager.getLanguageForPath(fileInfo.fullPath);
//				console.log (langObj);
//				console.log (doc);
				var text = doc.getText();
				var funcs = extractFunctions (text);
				funcs.forEach (function (func) {
					if (func.functionName === functionName) {
						foundFunctions.push ({
							path: fileInfo.fullPath,
							name: functionName,
							document: doc,
							func: func,
							lineStart: func.lineFrom,
							// TODO: use static analyzer tool
							// TODO: move to extractFunctions
							lineEnd:   posFromIndex (text, functionEnd (text, codeMirror, func.offsetTo)).line
						});
					}
				});
			}).always(function (error) {
				// If one file fails, continue to search
				oneResult.resolve();
			});

			return oneResult.promise();
		}).always(function () {
//			https://github.com/adobe/brackets/blob/6affa7907fdc820f7b9083bc0ff7c9fb87fb3e57/src/language/JSUtils.js
			result.resolve(foundFunctions);
		});
		return result.promise();
	}

	/**
	* @private
	* For unit and performance tests. Allows lookup by function name instead of editor offset
	* without constructing an inline editor.
	*
	* @param {!string} functionName
	* @return {$.Promise} a promise that will be resolved with an array of function offset information
	*/
	function _findInProject(functionName, hostEditor, callback) {
		var result = new $.Deferred();

		var openDocument  = hostEditor.document;
		var openDocFolder = openDocument.file.parentPath;

		function _sameDirCppFilter(file) {
			var langObj = LanguageManager.getLanguageForPath(file.fullPath);

			if (file.fullPath.indexOf (openDocFolder) === -1)
				return false;
//			console.log (file.fullPath, langObj.getId ().match (/^c(pp)?$/), file.fullPath.match (/\.(ino|pde|c|cpp)$/));
			if (file.fullPath.match (/\.(ino|pde|c|cpp)$/))
				return true;
//			if (langObj.getId ().match (/^c(pp)?$/))
//				return true;
//			if (langObj.isBinary())
//				return false;
			return false;
		}

		ProjectManager
		.getAllFiles (_sameDirCppFilter)
		.done(function (files) {
			matchFunctionNamesAsync (files, functionName, hostEditor._codeMirror).done (function (funcs) {
				if (!funcs || !funcs.length) {
					result.reject();
					return;
				}
				// TODO: callback can return promise
				var cbResult = callback && callback (funcs, result);
				if (cbResult) {
					if (cbResult === result) {
						// callback will resolve promise itself
						return;
					}
					result.resolve (cbResult);
					return;
				}
				result.reject ();
			});
		})
		.fail(function () {
			result.reject();
		});

		return result.promise();
	}

	function checkSelectionContext (hostEditor, pos) {
		// Only provide a editor when cursor is in proper content
		// console.log ("inline editor mode:", hostEditor.getModeForSelection());
		if (hostEditor.getModeForSelection() !== "text/x-c++src") {
			return null;
		}

		// Only provide editor if the selection is within a single line
		var sel = hostEditor.getSelection();
		if (sel.start.line !== sel.end.line) {
			return null;
		}

		return sel;
	}

	function jumpProvider (hostEditor, pos) {

		var sel = checkSelectionContext (hostEditor, pos);
		if (sel === null)
			return null;

		var functionResult = _getFunctionName(hostEditor, sel.start);
		if (!functionResult.functionName) {
			return functionResult.reason || null;
		}

		function jumpCallback (functions, result) {
			if (functions.length > 1) {
				// TODO: show matches
				console.log ('multiple functions match for "' + functionResult.functionName + '", using first one');
			}

			var firstMatch = functions[0];
			console.log (firstMatch);
			if (hostEditor.getFile().fullPath !== firstMatch.document.file.fullPath) {
				console.log ('jump to file');
				CommandManager.execute(Commands.FILE_OPEN, firstMatch.document.file).done(function () {
					var editor = EditorManager.getFocusedEditor();
					editor.setCursorPos(firstMatch.func.lineFrom, firstMatch.func.chFrom, true, true);
					result.resolve (true);
				});
				return result;
			} else {
				console.log ('internal jump');
				hostEditor.setCursorPos(firstMatch.func.lineFrom, firstMatch.func.chFrom, true, true);
				return true;
			}
		}

		var finderPromise = _findInProject(functionResult.functionName, hostEditor, jumpCallback);

//		finderPromise

	}

	/**
	* This function is registered with EditorManager as an inline editor provider. It creates an inline editor
	* when the cursor is on a JavaScript function name, finds all functions that match the name
	* and shows (one/all of them) in an inline editor.
	*
	* @param {!Editor} editor
	* @param {!{line:number, ch:number}} pos
	* @return {$.Promise} a promise that will be resolved with an InlineWidget
	*      or null if we're not ready to provide anything.
	*/
	function quickEditProvider (hostEditor, pos) {

		var sel = checkSelectionContext (hostEditor, pos);

		// Always use the selection start for determining the function name. The pos
		// parameter is usually the selection end.
		var functionResult = _getFunctionName(hostEditor, sel.start);
		if (!functionResult.functionName) {
			return functionResult.reason || null;
		}

		function inlineEditor (functions) {
			var cInlineEditor = new MultiRangeInlineEditor(functions);
			cInlineEditor.load(hostEditor);
			return cInlineEditor;
		}

		return _findInProject(functionResult.functionName, hostEditor, inlineEditor);
	}

	EditorManager.registerInlineEditProvider (quickEditProvider);
	EditorManager.registerJumpToDefProvider (jumpProvider);

//var codeHints = require ('./codehints').exports; // WTF???
////	console.log (codeHints);
//var codeHintsDelegate = new codeHints ();
//
//CodeHintManager.registerHintProvider (codeHintsDelegate, ['all'], 0);


	//////////////////////////////////////////////////////////////////////
	// Quick Open section
	//////////////////////////////////////////////////////////////////////

	/**
	* FileLocation class
	* @constructor
	* @param {string} fullPath
	* @param {number} line
	* @param {number} chFrom column start position
	* @param {number} chTo column end position
	* @param {string} functionName
	*/
	function FileLocation(fullPath, lineFrom, chFrom, lineTo, chTo, functionDesc, functionName) {
		this.fullPath = fullPath;
		this.lineFrom = lineFrom;
		this.chFrom   = chFrom;
		this.lineTo   = lineTo;
		this.chTo     = chTo;
		this.functionName = functionName;
		this.functionDesc = functionDesc;
	}

	function posFromIndex (source, off) {
		var ch, lineNo = 0, sz = -1;
		while (1) {
			ch = off - (sz + 1); // nex symbol after \n
			sz = source.indexOf ('\n', sz+1);
			if (sz === -1)
				break;
			if (sz > off) {
				break;
			}
			++lineNo;
		}
		return {line: lineNo, ch: ch};
	}

	function extractFunctions (source, langMode) {
		var commentOrInstruction = /\s*(\/\*[\s\S]*?\*\/|\/\/[^\n\r]*|#[^#\n\r]*)/gm;

		var funcs        = [];
		var instructions = [];
		var comments     = [];
		var matchArray   = [];

		var lineOffsets  = [];

		var firstStatementOffset;
		var lastMatchOffset;

		var lastInstructionOffset = 0;
		var ifInstruction         = 0;
		var ifInstructionOffset   = 0;

		while ((matchArray = commentOrInstruction.exec (source)) !== null) {
			//		console.log (matchArray.index, lastMatchOffset, matchArray[1]);
			if (
				lastMatchOffset !== undefined &&
				lastMatchOffset !== matchArray.index &&
				firstStatementOffset === undefined
			) {
				// first statement found. but this statement can be within #ifdef
				if (ifInstruction > 0) {
					firstStatementOffset = ifInstructionOffset;
				} else {
					firstStatementOffset = lastInstructionOffset;
				}
			}

			lastMatchOffset = matchArray.index + matchArray[0].length;

			if (matchArray[1][0] === '/') {
				comments.push ([matchArray.index, matchArray.index + matchArray[0].length]);
			} else {
				if (matchArray[1].match (/#ifdef/)) {
					ifInstruction ++;
					if (ifInstruction === 1) {
						ifInstructionOffset = matchArray.index;
					}
				} else if (matchArray[1].match (/#endif/)) {
					ifInstruction --;
				}
				instructions.push ([matchArray.index, matchArray.index + matchArray[0].length]);
				lastInstructionOffset = matchArray.index + matchArray[0].length;
			}
		}

		var lastCommentBeforeFunction = 0;

		var functionRe = /^([\s\n\r]*)((unsigned|signed|static)[\s\n\r]+)?(void|int|char|short|long|float|double|word|bool)[\s\n\r]+(\w+)[\s\n\r]*\(([^\)]*)\)[\s\n\r]*\{/gm;
		while ((matchArray = functionRe.exec (source)) !== null) {
			var skip = false;
			// TODO: comments stored in
			for (var i = lastCommentBeforeFunction; i < comments.length; i++) {
				// console.log (comments[i][0] + ' < ' + matchArray.index + ' ' + comments[i][1] + ' > ' + matchArray.index);
				if (comments[i][1] < matchArray.index)
					lastCommentBeforeFunction = i;

				// this comment is after function declaration
				if (comments[i][0] > matchArray.index)
					break;

				if (comments[i][0] < matchArray.index && comments[i][1] > matchArray.index) {
					skip = true;
					break;
				}
			}
			if (skip) {
				continue;
			}

			// matchArray.index
//			funcs.push ();

			var functionName = matchArray[5];

			var functionProto = [matchArray[2] || "", matchArray[4], matchArray[5], '('+matchArray[6]+')'].join (" ");

			// no more whitespace
			var posFrom = posFromIndex (source, matchArray.index + matchArray[1].length);
			// remove curly brackets
			var posTo   = posFromIndex (source, matchArray.index + matchArray[0].length - 1);

			funcs.push(new FileLocation(null, posFrom.line, posFrom.ch, posTo.line, posTo.ch, functionProto, functionName));
			funcs[funcs.length - 1].offsetFrom = matchArray.index + matchArray[1].length;
			funcs[funcs.length - 1].offsetTo   = matchArray.index + matchArray[0].length;

			//console.log (matchArray[1] || "", matchArray[3], matchArray[4], '(', matchArray[5], ');');
		}

		return funcs;
	}

	/**
	* Returns a list of information about selectors for a single document. This array is populated
	* by createSelectorList()
	* @return {?Array.<FileLocation>}
	*/
	function createSelectorList() {
		var doc = DocumentManager.getCurrentDocument();
		if (!doc) {
			return;
		}

		var docText = doc.getText();
//		var posFromIndex = doc._masterEditor._codeMirror.posFromIndex.bind (doc._masterEditor._codeMirror);
		return extractFunctions (docText, doc.getLanguage().getMode());
	}

	/**
	* @param {string} query what the user is searching for
	* @return {Array.<SearchResult>} sorted and filtered results that match the query
	*/
	function search(query, matcher) {
		var selectorList = matcher.selectorList;
		if (!selectorList) {
			selectorList = createSelectorList();
			matcher.selectorList = selectorList;
		}
		query = query.slice(query.indexOf("@") + 1, query.length);

		// Filter and rank how good each match is
		var filteredList = $.map(selectorList, function (itemInfo) {
			var searchResult = matcher.match(itemInfo.functionDesc, query);
			if (searchResult) {
				searchResult.selectorInfo = itemInfo;
			}
			return searchResult;
		});

		// Sort based on ranking & basic alphabetical order
		StringMatch.basicMatchSort(filteredList);

		return filteredList;
	}

	/**
	* @param {string} query what the user is searching for
	* @param {boolean} returns true if this plugin wants to provide results for this query
	*/
	function match(query) {
		// TODO: match any location of @ when QuickOpen._handleItemFocus() is modified to
		// dynamic open files
		//if (query.indexOf("@") !== -1) {
		if (query.indexOf("@") === 0) {
			return true;
		}
	}

	/**
	* Select the selected item in the current document
	* @param {?SearchResult} selectedItem
	*/
	function itemFocus(selectedItem) {
		if (!selectedItem) {
			return;
		}
		var selectorInfo = selectedItem.selectorInfo;

		var from = {line: selectorInfo.lineFrom, ch: selectorInfo.chFrom};
		var to = {line: selectorInfo.lineTo, ch: selectorInfo.chTo};
		EditorManager.getCurrentFullEditor().setSelection(from, to, true);
	}

	function itemSelect(selectedItem) {
		itemFocus(selectedItem);
	}



	QuickOpen.addQuickOpenPlugin(
		{
			name: "C-like sources",
			languageIds: ["c", "cpp"],
			search: search,
			match: match,
			itemFocus: itemFocus,
			itemSelect: itemSelect
		}
	);


});
