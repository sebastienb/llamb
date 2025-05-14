import { marked } from 'marked';
import { configureMarked } from './dist/utils/markdownRenderer.js';

// Configure marked with our renderer
configureMarked(true);

// Test a code block
const markdown = `
# Test Code Block

\`\`\`bash
ls -la
\`\`\`

\`\`\`
plain code block
\`\`\`

\`\`\`js
console.log("hello");
\`\`\`
`;

console.log('Rendering markdown:');
console.log('---------------------');
console.log(markdown);
console.log('---------------------');

try {
  const rendered = marked(markdown);
  console.log('Rendered result:');
  console.log('---------------------');
  console.log(rendered);
  console.log('---------------------');
  
  // Check if our markers are in the output
  const regex = /\[EXECUTABLE_COMMAND_BLOCK:([^:]+):([^\]]+)\]/g;
  let match;
  console.log('Detected command blocks:');
  let count = 0;
  while ((match = regex.exec(rendered)) !== null) {
    count++;
    const language = match[1];
    const base64Code = match[2];
    const code = Buffer.from(base64Code, 'base64').toString();
    console.log(`Match ${count}: language=${language}, code=${code}`);
  }
  
  if (count === 0) {
    console.log('No command blocks detected in the output');
  }
} catch (error) {
  console.error('Error:', error);
}