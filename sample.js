function calculateTotal(items) {
  let total = 0;
  for (let i = 0; i < items.length; i++) {
    total = total + items[i].price;
  }
  return total;
}

function applyDiscount(total, discountCode) {
  if (discountCode == "SAVE10") {
    return total * 0.9;
  } else if (discountCode == "SAVE20") {
    return total * 0.8;
  }
  return total;
}

const cart = [
  { name: "Laptop", price: 999.99 },
  { name: "Mouse", price: 29.99 },
  { name: "Keyboard", price: 59.99 }
];

const subtotal = calculateTotal(cart);
console.log("Subtotal: " + subtotal);

const total = applyDiscount(subtotal, "SAVE10");
console.log("Total after discount: " + total);
EOF < /dev/null