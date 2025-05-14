import { isExecutableCodeBlock } from './dist/utils/commandUtils.js';

// Sample code block test
const tests = [
  { language: 'bash', code: 'ls -la', expected: true },
  { language: 'sh', code: 'echo "Hello World"', expected: true },
  { language: null, code: '$ ls -la', expected: true },
  { language: 'js', code: 'console.log("hello");', expected: false },
  { language: 'bash', code: null, expected: false },
  { language: null, code: null, expected: false }
];

console.log('Testing command detection:');
tests.forEach((test, i) => {
  try {
    const result = isExecutableCodeBlock(test.language, test.code);
    const passed = result === test.expected;
    console.log(`Test ${i+1}: ${passed ? '✅ PASS' : '❌ FAIL'} - language: ${test.language}, code: ${test.code ? test.code.substring(0, 20) : null}, result: ${result}, expected: ${test.expected}`);
  } catch (error) {
    console.error(`Test ${i+1}: 💥 ERROR - ${error.message}`);
  }
});