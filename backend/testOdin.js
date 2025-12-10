// testOdin.js - Test the ODIN scraper
const { searchODIN } = require('./odinScraper');

async function testSearch() {
  console.log('='.repeat(60));
  console.log('Testing ODIN Equipment Scraper');
  console.log('='.repeat(60));
  
  const queries = ['BrahMos', 'Javelin', 'Patriot'];
  
  for (const query of queries) {
    console.log(`\n\nSearching for: ${query}`);
    console.log('-'.repeat(60));
    
    try {
      const result = await searchODIN(query);
      
      if (result.success) {
        console.log('✅ Search successful!');
        console.log('\nEquipment Details:');
        console.log('Name:', result.equipment.name);
        console.log('Type:', result.equipment.type);
        console.log('Description:', result.equipment.description.substring(0, 200) + '...');
        
        console.log('\nSpecifications:');
        const specs = result.equipment.specifications;
        Object.entries(specs).slice(0, 5).forEach(([key, value]) => {
          console.log(`  ${key}: ${value}`);
        });
        
        console.log('\nImages found:', result.equipment.images.length);
        console.log('Variants:', result.equipment.variants.length);
        console.log('Operators:', result.equipment.operators.join(', '));
        
        if (result.equipment.notes) {
          console.log('\nNotes preview:', result.equipment.notes.substring(0, 300) + '...');
        }
        
        if (result.equipment.intelligence) {
          console.log('\nIntelligence sections available:');
          Object.keys(result.equipment.intelligence).forEach(key => {
            if (result.equipment.intelligence[key]) {
              console.log(`  ✓ ${key}`);
            }
          });
        }
        
      } else {
        console.log('❌ Search failed:', result.error);
      }
      
    } catch (error) {
      console.log('❌ Error:', error.message);
    }
    
    // Wait between queries to avoid rate limiting
    if (query !== queries[queries.length - 1]) {
      console.log('\nWaiting 5 seconds before next query...');
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('Test completed');
  console.log('='.repeat(60));
}

// Run the test
testSearch().catch(console.error);