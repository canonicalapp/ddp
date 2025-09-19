/**
 * Mock for find-up module to avoid ES module issues in Jest
 */

/* eslint-env node, jest */
/* eslint-disable no-undef */

// Mock implementation of findUp function
const findUp = jest.fn().mockResolvedValue(null);

module.exports = {
  findUp,
};
