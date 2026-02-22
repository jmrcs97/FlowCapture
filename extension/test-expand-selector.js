// Simula o seletor gerado
const element = {
    tagName: 'DIV',
    className: 'quote-content prepare-treatment',
    id: ''
};

// O seletor primary gerado foi:
const primary = 'div > div.slide-wrapper > div.slide-content > div.quote-content';

console.log('Primary selector:', primary);
console.log('Element classes:', element.className);
console.log('\n💡 Suggested fallbacks:');
console.log('  1. .slide-content > .quote-content');
console.log('  2. .quote-content.prepare-treatment');  
console.log('  3. div.quote-content.prepare-treatment');
console.log('  4. .quote-content:has-text("Prepare")'); // if it has unique text
