/**
 * Mock for find-up module to avoid ES module issues in Jest
 */

// Mock implementation of findUp function
const findUp = jest.fn().mockResolvedValue(null);

module.exports = {
  findUp,
};
