define(function (require, exports, module) {
	"use strict";

	var EditorManager       = brackets.getModule("editor/EditorManager"),
		QuickOpen           = brackets.getModule("search/QuickOpen"),
		CSSUtils            = brackets.getModule("language/CSSUtils"),
		DocumentManager     = brackets.getModule("document/DocumentManager"),
		StringMatch         = brackets.getModule("utils/StringMatch"),
		CodeHintManager	    = brackets.getModule('editor/CodeHintManager');


function javaScriptFunctionProvider(hostEditor, pos) {
	// Only provide a JavaScript editor when cursor is in JavaScript content
	console.log ("inline editor mode:", hostEditor.getModeForSelection());
	if (hostEditor.getModeForSelection() !== "javascript") {
		return null;
	}

	// Only provide JavaScript editor if the selection is within a single line
	var sel = hostEditor.getSelection();
	if (sel.start.line !== sel.end.line) {
		return null;
	}

	return null;

	// Always use the selection start for determining the function name. The pos
	// parameter is usually the selection end.
	var functionResult = _getFunctionName(hostEditor, sel.start);
	if (!functionResult.functionName) {
		return functionResult.reason || null;
	}

	return _createInlineEditor(hostEditor, functionResult.functionName);
}

//EditorManager.registerInlineEditProvider(javaScriptFunctionProvider);
//
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
	function FileLocation(fullPath, lineFrom, chFrom, lineTo, chTo, functionName) {
		this.fullPath = fullPath;
		this.lineFrom = lineFrom;
		this.chFrom   = chFrom;
		this.lineTo   = lineTo;
		this.chTo     = chTo;
		this.functionName = functionName;
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

			var functionProto = [matchArray[2] || "", matchArray[4], matchArray[5], '('+matchArray[6]+')'].join (" ");

			// no more whitespace
			var posFrom = posFromIndex (source, matchArray.index + matchArray[1].length);
			// remove curly brackets
			var posTo   = posFromIndex (source, matchArray.index + matchArray[0].length - 1);

			funcs.push(new FileLocation(null, posFrom.line, posFrom.ch, posTo.line, posTo.ch, functionProto));

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
			var searchResult = matcher.match(itemInfo.functionName, query);
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
