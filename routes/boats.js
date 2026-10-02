const express = require('express');
const router = express.Router();

// Yahan boats ke routes add karo
router.get('/', (req, res) => {
    res.json({ message: 'Boats route working' });
});

module.exports = router;
