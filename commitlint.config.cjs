module.exports = {
  extends: ['@commitlint/config-conventional'],
  ignores: [
    message => /^Merge (?:pull request|branch\b)/m.test(message),
    message => /^Revert "/m.test(message),
  ],
};
