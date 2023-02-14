/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import { Parser } from 'vs/platform/contextkey/common/contextkey';
import { Scanner, Token } from 'vs/platform/contextkey/common/scanner';

export function parse(input: string): string {
	const parser = new Parser();

	const prints: string[] = [];

	const log = (...ss: string[]) => { ss.forEach(s => prints.push(s)); };

	const expr = parser.parse(input);
	if (expr === undefined) {
		if (parser.lexingErrors.length > 0) {
			log('Lexing errors:', '\n\n');
			parser.lexingErrors.forEach(token => log(Scanner.reportError(token), '\n'));
		}

		if (parser.parsingErrors.length > 0) {
			if (parser.lexingErrors.length > 0) { log('\n --- \n'); }
			log('Parsing errors:', '\n\n');
			parser.parsingErrors.forEach(({ token, message }: { token: Token; message: string }) => log(`${message}`, '\n'));
		}

	} else {
		log(expr.serialize());
	}

	return prints.join('');
}

suite('Context Key Scanner', () => {
	test('!true && foo', () => {
		const input = `!true && foo`;
		assert.deepStrictEqual(parse(input), "false");
	});

	test(`!isAppcanProject && !inDebugMode && 1===2`, () => {
		const input = `!isAppcanProject && !inDebugMode && 1===2`;
		assert.deepStrictEqual(parse(input), "(!inDebugMode && !isAppcanProject && 1 == '2')");
	});


	test(' foo', () => {
		const input = ' foo';
		assert.deepStrictEqual(parse(input), "foo");
	});

	test('!foo', () => {
		const input = '!foo';
		assert.deepStrictEqual(parse(input), "!foo");
	});


	test('foo =~ /bar/', () => {
		const input = 'foo =~ /bar/';
		assert.deepStrictEqual(parse(input), "foo =~ /bar/");
	});

	// FIXME: isMac is a constant, how to test such expressions?
	// test('foo =~ /bar/ && isMac', () => {
	// 	const input = 'foo =~ /bar/ && isMac';
	// 	assert.deepStrictEqual(parse(input), "foo =~ /bar/");
	// });

	test(`foo || (foo =~ /bar/ && baz)`, () => {
		const input = `foo || (foo =~ /bar/ && baz)`;
		assert.deepStrictEqual(parse(input), "(foo || (baz && foo =~ /bar/))");
	});

	test('foo || (foo =~ /bar/ || baz)', () => {
		const input = 'foo || (foo =~ /bar/ || baz)';
		assert.deepStrictEqual(parse(input), "(baz || foo || foo =~ /bar/)");
	});

	test('foo && (foo =~ /bar/ || isMac)', () => {
		const input = 'foo && (foo =~ /bar/ || isMac)';
		assert.deepStrictEqual(parse(input), "foo");
	});

	test('foo && foo =~ /zee/i', () => {
		const input = 'foo && foo =~ /zee/i';
		assert.deepStrictEqual(parse(input), "(foo && foo =~ /zee/i)");
	});

	test('foo.bar==enabled', () => {
		const input = 'foo.bar==enabled';
		assert.deepStrictEqual(parse(input), "foo.bar == 'enabled'");
	});

	test(`foo.bar == 'enabled'`, () => {
		const input = `foo.bar == 'enabled'`;
		assert.deepStrictEqual(parse(input), `foo.bar == 'enabled'`);
	});

	test('foo.bar:zed==completed - equality with no space', () => {
		const input = 'foo.bar:zed==completed';
		assert.deepStrictEqual(parse(input), "foo.bar:zed == 'completed'");
	});

	test('a && b || c', () => {
		const input = 'a && b || c';
		assert.deepStrictEqual(parse(input), '(c || (a && b))'); // FIXME: is only the serialization order wrong or evaluation as well?
	});

	test('fooBar && baz.jar && fee.bee<K-loo+1>', () => {
		const input = 'fooBar && baz.jar && fee.bee<K-loo+1>';
		assert.deepStrictEqual(parse(input), `(baz.jar && fee.bee<K-loo+1> && fooBar)`);
	});

	test('foo.barBaz<C-r> < 2', () => {
		const input = 'foo.barBaz<C-r> < 2';
		assert.deepStrictEqual(parse(input), `foo.barBaz<C-r> < 2`);
	});

	test('foo.bar >= -1', () => {
		const input = 'foo.bar >= -1';
		assert.deepStrictEqual(parse(input), "foo.bar >= -1");
	});

	test(`view == vsc-packages-activitybar-folders && vsc-packages-folders-loaded`, () => {
		const input = `view == vsc-packages-activitybar-folders && vsc-packages-folders-loaded`;
		assert.deepStrictEqual(parse(input), "(vsc-packages-folders-loaded && view == 'vsc-packages-activitybar-folders ')");
	});

	test('foo.bar <= -1', () => {
		const input = 'foo.bar <= -1';
		assert.deepStrictEqual(parse(input), `foo.bar <= -1`);
	});


	test('!cmake:hideBuildCommand \u0026\u0026 cmake:enableFullFeatureSet', () => {
		const input = '!cmake:hideBuildCommand \u0026\u0026 cmake:enableFullFeatureSet';
		assert.deepStrictEqual(parse(input), `(cmake:enableFullFeatureSet && !cmake:hideBuildCommand)`);
	});


	suite('error handling', () => {
		test('!foo &&  in bar', () => {
			const input = '!foo &&  in bar';
			assert.deepStrictEqual(parse(input), "Parsing errors:\n\nExpected 'true', 'false', '(', KEY, KEY '=~' regex, KEY [ ('==' | '!=' | '<' | '<=' | '>' | '>=' | 'in' | 'not' 'in') value ] but got {\"type\":\"in\",\"offset\":9}\n");
		});

		test(`view =~ '/(servers)/' && viewItem =~ /^(Starting|Started|Debugging|Stopping|Stopped|Unknown)/'`, () => {
			const input = `view =~ '/(servers)/' && viewItem =~ /^(Starting|Started|Debugging|Stopping|Stopped|Unknown)/'`;
			assert.deepStrictEqual(parse(input), "Lexing errors:\n\nUnexpected token ''' at offset 93\n");
		});

		test('debugState == \"stopped\"', () => {
			const input = 'debugState == \"stopped\"';
			assert.deepStrictEqual(parse(input), "Parsing errors:\n\nUnexpected token '\"' at offset 22\n"); // FIXME ulugbek
		});

		test('vim<c-r>==1 && vim<2<=3', () => {
			const input = 'vim<c-r>==1 && vim<2<=3';
			assert.deepStrictEqual(parse(input), "Lexing errors:\n\nUnexpected token '=' at offset 21. Did you mean '==' or '=~'?\n"); // FIXME
		});

		test(` viewItem == VSCode WorkSpace`, () => {
			const input = ` viewItem == VSCode WorkSpace`;
			assert.deepStrictEqual(parse(input), "Parsing errors:\n\nUnexpected token 'WorkSpace' at offset 20\n"); // FIXME
		});

		test(' oo', () => {
			const input = `foo && 'bar`;
			assert.deepStrictEqual(parse(input), "Lexing errors:\n\nUnexpected token ''bar' at offset 7. Did you forget to close the string?\n");
		});

		test('!(foo && bar)', () => {
			const input = '!(foo && bar)';
			assert.deepStrictEqual(parse(input), "Parsing errors:\n\nExpected KEY, 'true', or 'false'\n");
		});

	});

});
