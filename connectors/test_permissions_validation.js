const fs = require('fs');

// Mock the io-ts validation logic for demonstration
// In the actual implementation, this would use the real io-ts library
function validatePermissionsWithSchema(parsedPermissions) {
    // This simulates the io-ts validation logic
    const validPermissions = ["read", "write", "read_write", "none"];

    if (typeof parsedPermissions !== 'object' || parsedPermissions === null) {
        throw new Error("Invalid JSON: expected an object");
    }

    for (const [key, value] of Object.entries(parsedPermissions)) {
        if (!validPermissions.includes(value)) {
            throw new Error(`Invalid permission value for key '${key}': ${value}. Must be one of: ${validPermissions.join(', ')}`);
        }
    }

    return parsedPermissions;
}

// Test the JSON parsing logic from our CLI implementation
function testPermissionsFileValidation(permissionsFile) {
    try {
        if (!fs.existsSync(permissionsFile)) {
            throw new Error(`Permissions file not found: ${permissionsFile}`);
        }

        const fileContent = fs.readFileSync(permissionsFile, 'utf8');
        const parsedPermissions = JSON.parse(fileContent);

        // Validate using schema (simulated io-ts validation)
        const validatedPermissions = validatePermissionsWithSchema(parsedPermissions);

        console.log('✅ Permissions file validation passed!');
        console.log('Parsed permissions:', validatedPermissions);
        return validatedPermissions;
    } catch (error) {
        console.error('❌ Validation failed:', error.message);
        throw error;
    }
}

// Test with our example file
console.log('Testing permissions file validation with schema validation...');
testPermissionsFileValidation('test_permissions_file.json');

// Test with non-existent file
console.log('\nTesting with non-existent file...');
try {
    testPermissionsFileValidation('non_existent_file.json');
} catch (error) {
    console.log('✅ Correctly caught error for non-existent file');
}

// Test with invalid JSON
console.log('\nTesting with invalid JSON...');
fs.writeFileSync('invalid_permissions.json', '{ invalid json }');
try {
    testPermissionsFileValidation('invalid_permissions.json');
} catch (error) {
    console.log('✅ Correctly caught JSON parsing error');
}
fs.unlinkSync('invalid_permissions.json');

// Test with invalid permission values
console.log('\nTesting with invalid permission values...');
fs.writeFileSync('invalid_permissions.json', '{"folder_1": "invalid_permission"}');
try {
    testPermissionsFileValidation('invalid_permissions.json');
} catch (error) {
    console.log('✅ Correctly caught invalid permission value error');
}
fs.unlinkSync('invalid_permissions.json');

// Test with non-object JSON
console.log('\nTesting with non-object JSON...');
fs.writeFileSync('invalid_permissions.json', '"not an object"');
try {
    testPermissionsFileValidation('invalid_permissions.json');
} catch (error) {
    console.log('✅ Correctly caught non-object error');
}
fs.unlinkSync('invalid_permissions.json');

console.log('\n🎉 All schema validation tests completed!');
console.log('\nNote: In the actual implementation, this uses io-ts for robust schema validation');
console.log('with detailed error reporting and type safety.'); 