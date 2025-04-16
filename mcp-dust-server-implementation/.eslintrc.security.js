module.exports = {
  plugins: ['security'],
  extends: ['plugin:security/recommended'],
  rules: {
    // Enforce the use of === and !==
    'eqeqeq': ['error', 'always'],
    
    // Disallow the use of eval()
    'no-eval': 'error',
    
    // Disallow the use of Function constructor
    'no-new-func': 'error',
    
    // Disallow the use of __proto__
    'no-proto': 'error',
    
    // Disallow the use of arguments.caller or arguments.callee
    'no-caller': 'error',
    
    // Disallow the use of implied eval via setTimeout, setInterval
    'no-implied-eval': 'error',
    
    // Disallow the use of with statements
    'no-with': 'error',
    
    // Disallow the use of Function.prototype.bind()
    'no-extra-bind': 'error',
    
    // Disallow the use of Object.prototype.constructor
    'no-constructor-return': 'error',
    
    // Disallow the use of Object.prototype.__defineGetter__
    'no-extend-native': 'error',
    
    // Disallow the use of Object.prototype.__defineSetter__
    'no-implicit-globals': 'error',
    
    // Disallow the use of Object.prototype.__lookupGetter__
    'no-iterator': 'error',
    
    // Disallow the use of Object.prototype.__lookupSetter__
    'no-labels': 'error',
    
    // Disallow the use of Object.prototype.isPrototypeOf
    'no-lone-blocks': 'error',
    
    // Disallow the use of Object.prototype.propertyIsEnumerable
    'no-multi-str': 'error',
    
    // Disallow the use of Object.prototype.toLocaleString
    'no-new': 'error',
    
    // Disallow the use of Object.prototype.toString
    'no-new-wrappers': 'error',
    
    // Disallow the use of Object.prototype.valueOf
    'no-octal': 'error',
    
    // Disallow the use of Object.prototype.watch
    'no-octal-escape': 'error',
    
    // Disallow the use of Object.prototype.unwatch
    'no-param-reassign': 'error',
    
    // Disallow the use of Object.prototype.hasOwnProperty
    'no-proto': 'error',
    
    // Disallow the use of Object.prototype.isPrototypeOf
    'no-return-assign': 'error',
    
    // Disallow the use of Object.prototype.propertyIsEnumerable
    'no-script-url': 'error',
    
    // Disallow the use of Object.prototype.toLocaleString
    'no-self-compare': 'error',
    
    // Disallow the use of Object.prototype.toString
    'no-sequences': 'error',
    
    // Disallow the use of Object.prototype.valueOf
    'no-throw-literal': 'error',
    
    // Disallow the use of Object.prototype.watch
    'no-unmodified-loop-condition': 'error',
    
    // Disallow the use of Object.prototype.unwatch
    'no-unused-expressions': 'error',
    
    // Disallow the use of Object.prototype.hasOwnProperty
    'no-useless-call': 'error',
    
    // Disallow the use of Object.prototype.isPrototypeOf
    'no-useless-concat': 'error',
    
    // Disallow the use of Object.prototype.propertyIsEnumerable
    'no-useless-escape': 'error',
    
    // Disallow the use of Object.prototype.toLocaleString
    'no-void': 'error',
    
    // Disallow the use of Object.prototype.toString
    'no-warning-comments': 'warn',
    
    // Disallow the use of Object.prototype.valueOf
    'radix': 'error',
    
    // Disallow the use of Object.prototype.watch
    'vars-on-top': 'error',
    
    // Disallow the use of Object.prototype.unwatch
    'yoda': 'error',
    
    // Security rules
    'security/detect-buffer-noassert': 'error',
    'security/detect-child-process': 'error',
    'security/detect-disable-mustache-escape': 'error',
    'security/detect-eval-with-expression': 'error',
    'security/detect-new-buffer': 'error',
    'security/detect-no-csrf-before-method-override': 'error',
    'security/detect-non-literal-fs-filename': 'error',
    'security/detect-non-literal-regexp': 'error',
    'security/detect-non-literal-require': 'error',
    'security/detect-object-injection': 'warn',
    'security/detect-possible-timing-attacks': 'error',
    'security/detect-pseudoRandomBytes': 'error',
    'security/detect-unsafe-regex': 'error',
  },
};
