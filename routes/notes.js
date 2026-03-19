const express = require('express');
const router = express.Router();
const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const Note = require('../models/Note');
const { ensureAuth } = require('../middleware/auth');

// Cloudinary storage
const storage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => {
    const isVideo = file.mimetype.startsWith('video/');
    return {
      folder: 'note-to-you',
      resource_type: isVideo ? 'video' : 'image',
      allowed_formats: ['jpg','jpeg','png','gif','webp','mp4','mov','avi','webm'],
      transformation: isVideo ? [] : [{ quality: 'auto', fetch_format: 'auto' }]
    };
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg','image/png','image/gif','image/webp','video/mp4','video/quicktime','video/avi','video/webm'];
    allowed.includes(file.mimetype) ? cb(null, true) : cb(new Error('Invalid file type'));
  }
});

// ── GET all notes ─────────────────────────────────────────────
router.get('/', ensureAuth, async (req, res) => {
  try {
    const { search, tag } = req.query;
    let query = {};
    if (search) query.content = { $regex: search, $options: 'i' };
    if (tag) query.tags = tag;
    const notes = await Note.find(query).sort({ createdAt: -1 }).limit(200);
    res.json(notes);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET user profile notes ────────────────────────────────────
router.get('/user/:userId', ensureAuth, async (req, res) => {
  try {
    const notes = await Note.find({ 'author.id': req.params.userId }).sort({ createdAt: -1 });
    res.json(notes);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET pinned notes ──────────────────────────────────────────
router.get('/pinned', ensureAuth, async (req, res) => {
  try {
    const notes = await Note.find({ pinnedBy: req.user._id }).sort({ createdAt: -1 });
    res.json(notes);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST create note ──────────────────────────────────────────
router.post('/', ensureAuth, upload.array('media', 4), async (req, res) => {
  try {
    const { content, tags, color } = req.body;
    if (!content || !content.trim()) return res.status(400).json({ error: 'Content required.' });
    const mediaFiles = (req.files || []).map(f => ({
      url: f.path, publicId: f.filename,
      type: f.mimetype.startsWith('video/') ? 'video' : 'image'
    }));
    const parsedTags = tags ? tags.split(',').map(t => t.trim().toLowerCase()).filter(Boolean).slice(0, 5) : [];
    const note = await Note.create({
      content: content.trim(),
      author: { id: req.user._id, displayName: req.user.displayName, avatar: req.user.avatar },
      media: mediaFiles,
      tags: parsedTags,
      color: color || 'default'
    });
    res.status(201).json(note);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create note.' });
  }
});

// ── POST react ────────────────────────────────────────────────
router.post('/:id/react', ensureAuth, async (req, res) => {
  try {
    const note = await Note.findById(req.params.id);
    if (!note) return res.status(404).json({ error: 'Not found.' });
    const { emoji } = req.body;
    const userId = req.user._id.toString();
    const existingIndex = note.reactions.findIndex(
      r => r.userId.toString() === userId && r.emoji === emoji
    );
    if (existingIndex !== -1) {
      note.reactions.splice(existingIndex, 1);
    } else {
      note.reactions.push({ userId: req.user._id, emoji });
    }
    await note.save();
    res.json(note.reactions);
  } catch (err) {
    res.status(500).json({ error: 'Failed to react.' });
  }
});

// ── POST comment ──────────────────────────────────────────────
router.post('/:id/comment', ensureAuth, async (req, res) => {
  try {
    const note = await Note.findById(req.params.id);
    if (!note) return res.status(404).json({ error: 'Not found.' });
    const { content } = req.body;
    if (!content || !content.trim()) return res.status(400).json({ error: 'Comment required.' });
    note.comments.push({
      author: { id: req.user._id, displayName: req.user.displayName, avatar: req.user.avatar },
      content: content.trim()
    });
    await note.save();
    res.json(note.comments);
  } catch (err) {
    res.status(500).json({ error: 'Failed to comment.' });
  }
});

// ── POST pin/unpin ────────────────────────────────────────────
router.post('/:id/pin', ensureAuth, async (req, res) => {
  try {
    const note = await Note.findById(req.params.id);
    if (!note) return res.status(404).json({ error: 'Not found.' });
    const isPinned = note.pinnedBy.map(id => id.toString()).includes(req.user._id.toString());
    if (isPinned) {
      note.pinnedBy = note.pinnedBy.filter(id => id.toString() !== req.user._id.toString());
    } else {
      note.pinnedBy.push(req.user._id);
    }
    await note.save();
    res.json({ pinned: !isPinned });
  } catch (err) {
    res.status(500).json({ error: 'Failed to pin.' });
  }
});

// ── PUT edit note ─────────────────────────────────────────────
router.put('/:id', ensureAuth, async (req, res) => {
  try {
    const note = await Note.findById(req.params.id);
    if (!note) return res.status(404).json({ error: 'Not found.' });
    if (note.author.id.toString() !== req.user._id.toString()) return res.status(403).json({ error: 'Not authorized.' });
    const { content, tags, color } = req.body;
    if (!content || !content.trim()) return res.status(400).json({ error: 'Content required.' });
    note.content = content.trim();
    if (tags !== undefined) note.tags = tags.split(',').map(t => t.trim().toLowerCase()).filter(Boolean).slice(0, 5);
    if (color) note.color = color;
    note.updatedAt = new Date();
    await note.save();
    res.json(note);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update.' });
  }
});

// ── DELETE comment ────────────────────────────────────────────
router.delete('/:id/comment/:commentId', ensureAuth, async (req, res) => {
  try {
    const note = await Note.findById(req.params.id);
    if (!note) return res.status(404).json({ error: 'Not found.' });
    const comment = note.comments.id(req.params.commentId);
    if (!comment) return res.status(404).json({ error: 'Comment not found.' });
    if (comment.author.id.toString() !== req.user._id.toString()) return res.status(403).json({ error: 'Not authorized.' });
    comment.deleteOne();
    await note.save();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete comment.' });
  }
});

// ── DELETE note ───────────────────────────────────────────────
router.delete('/:id', ensureAuth, async (req, res) => {
  try {
    const note = await Note.findById(req.params.id);
    if (!note) return res.status(404).json({ error: 'Not found.' });
    if (note.author.id.toString() !== req.user._id.toString()) return res.status(403).json({ error: 'Not authorized.' });
    for (const m of note.media) {
      if (m.publicId) {
        try { await cloudinary.uploader.destroy(m.publicId, { resource_type: m.type === 'video' ? 'video' : 'image' }); } catch(e) {}
      }
    }
    await note.deleteOne();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete.' });
  }
});

module.exports = router;