// Polyfill for findLastIndex
if (!Array.prototype.findLastIndex) {
  Array.prototype.findLastIndex = function(callbackFn, thisArg) {
    if (this == null) {
      throw new TypeError('Array.prototype.findLastIndex called on null or undefined');
    }
    if (typeof callbackFn !== 'function') {
      throw new TypeError('predicate must be a function');
    }
    
    let o = Object(this);
    let len = o.length >>> 0;
    
    for (let i = len - 1; i >= 0; i--) {
      let value = o[i];
      if (callbackFn.call(thisArg, value, i, o)) {
        return i;
      }
    }
    
    return -1;
  };
}

export default {};