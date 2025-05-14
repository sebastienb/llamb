import { isExecutableCodeBlock } from './src/utils/commandUtils.js';
import { marked } from 'marked';
import { configureMarked } from './src/utils/markdownRenderer.js';

// Configure marked with our custom renderer
configureMarked(true);

// Test markdown content with various code blocks
const markdown = `
# Test Code Blocks

## Bash code block
\`\`\`bash
ls -la
\`\`\`

## Shell code block
\`\`\`shell
echo "Hello World"
\`\`\`

## JavaScript code block
\`\`\`javascript
console.log("Hello World");
\`\`\`

## Plain text code block
\`\`\`
ls -la
\`\`\`

## Inline code
This is \`ls -la\` inline code.

## Regular text
This is regular text, not a code block.
`;

console.log('Rendering markdown...');
const output = marked(markdown);
console.log('\nOutput (first 500 chars):');
console.log(output.substring(0, 500) + '...');

// Check for command markers
const markerCount = (output.match(/#CMD_MARKER@/g) || []).length;
console.log(`\nFound ${markerCount} command markers in output`);

// Test direct command detection function
console.log('\nTesting isExecutableCodeBlock function directly:');
const tests = [
  { language: 'bash', code: 'ls -la', expected: true },
  { language: 'sh', code: 'echo "Hello World"', expected: true },
  { language: 'javascript', code: 'console.log("Hello");', expected: false },
  { language: null, code: 'ls -la', expected: true },
  { language: null, code: 'echo "Hello World"', expected: true }
];

tests.forEach((test, i) => {
  const result = isExecutableCodeBlock(test.language, test.code);
  console.log(`Test ${i+1}: [${result === test.expected ? 'PASS' : 'FAIL'}] language=${test.language}, code="${test.code}", result=${result}, expected=${test.expected}`);
});