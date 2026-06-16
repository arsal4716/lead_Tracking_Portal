'use strict';

const router = require('express').Router();

// ── Auth ───────────────────────────────────────────────────────────────────────
const authRouter = require('express').Router();
const authCtrl   = require('../controllers/auth.controller');
const { validate, schemas } = require('../validators');
authRouter.post('/register', validate(schemas.register), authCtrl.register);
authRouter.post('/login',    validate(schemas.login),    authCtrl.login);
authRouter.post('/refresh',  authCtrl.refreshToken);
authRouter.post('/logout',   authCtrl.logout);
authRouter.get( '/me',       require('../middleware/auth').protect, authCtrl.me);

// ── Publishers (super_admin only) ──────────────────────────────────────────────
const publisherRouter = require('express').Router();
const publisherCtrl   = require('../controllers/publisher.controller');
const { protect, restrictTo, tenantIsolation } = require('../middleware/auth');
const { ROLES } = require('../models/User');
publisherRouter.use(protect, restrictTo(ROLES.SUPER_ADMIN));
publisherRouter.get(   '/',                 publisherCtrl.getAll);
publisherRouter.post(  '/',                 validate(schemas.createPublisher), publisherCtrl.create);
publisherRouter.get(   '/:id',              publisherCtrl.getOne);
publisherRouter.patch( '/:id',              publisherCtrl.update);
publisherRouter.patch( '/:id/toggle',       publisherCtrl.toggleActive);    // pause/unpause
publisherRouter.delete('/:id',              publisherCtrl.delete);           // permanent delete
publisherRouter.post(  '/:id/rotate-key',   publisherCtrl.rotateApiKey);
publisherRouter.patch( '/:id/ip-whitelist', publisherCtrl.updateIpWhitelist);

// ── Campaigns ──────────────────────────────────────────────────────────────────
const campaignRouter = require('express').Router();
const campaignCtrl   = require('../controllers/campaign.controller');
campaignRouter.use(protect, tenantIsolation);
campaignRouter.get(   '/',                campaignCtrl.getAll);
campaignRouter.post(  '/',                restrictTo(ROLES.SUPER_ADMIN, ROLES.ADMIN), validate(schemas.createCampaign), campaignCtrl.create);
campaignRouter.get(   '/:id',            campaignCtrl.getOne);
campaignRouter.get(   '/:id/enrich-url', campaignCtrl.getEnrichUrl);
campaignRouter.patch( '/:id',            restrictTo(ROLES.SUPER_ADMIN, ROLES.ADMIN), campaignCtrl.update);
campaignRouter.patch( '/:id/toggle',     restrictTo(ROLES.SUPER_ADMIN, ROLES.ADMIN), campaignCtrl.toggleActive); // pause/unpause
campaignRouter.delete('/:id',            restrictTo(ROLES.SUPER_ADMIN),              campaignCtrl.delete);        // permanent delete

// ── Fields ─────────────────────────────────────────────────────────────────────
const fieldRouter = require('express').Router();
const fieldCtrl   = require('../controllers/field.controller');
fieldRouter.use(protect);
fieldRouter.get(   '/',    fieldCtrl.getAll);
fieldRouter.post(  '/',    restrictTo(ROLES.SUPER_ADMIN), validate(schemas.createField), fieldCtrl.create);
fieldRouter.get(   '/:id', fieldCtrl.getOne);
fieldRouter.patch( '/:id', restrictTo(ROLES.SUPER_ADMIN), fieldCtrl.update);
fieldRouter.delete('/:id', restrictTo(ROLES.SUPER_ADMIN), fieldCtrl.delete);

// ── Submissions ────────────────────────────────────────────────────────────────
const submissionRouter = require('express').Router();
const submissionCtrl   = require('../controllers/submission.controller');
submissionRouter.use(protect, tenantIsolation);
submissionRouter.get(   '/stats',       submissionCtrl.getStats);
submissionRouter.get(   '/',            submissionCtrl.getAll);
submissionRouter.post(  '/',            validate(schemas.submitLead), submissionCtrl.submit);
submissionRouter.get(   '/:id',         submissionCtrl.getOne);
submissionRouter.post(  '/:id/repost',  validate(schemas.repostLead), submissionCtrl.repost);
// Reset — super_admin only; clears ALL submission records (fresh start)
submissionRouter.delete('/reset',       restrictTo(ROLES.SUPER_ADMIN), submissionCtrl.reset);
// Delete a single submission — super_admin only (must come after /reset)
submissionRouter.delete('/:id',         restrictTo(ROLES.SUPER_ADMIN), submissionCtrl.deleteOne);

// ── Users ──────────────────────────────────────────────────────────────────────
const userRouter = require('express').Router();
const userCtrl   = require('../controllers/user.controller');
userRouter.use(protect, tenantIsolation, restrictTo(ROLES.SUPER_ADMIN, ROLES.ADMIN));
userRouter.get(   '/',                   userCtrl.getAll);
userRouter.post(  '/',                   userCtrl.create);
userRouter.get(   '/:id',               userCtrl.getOne);
userRouter.patch( '/:id',               userCtrl.update);
userRouter.patch( '/:id/toggle-active', userCtrl.toggleActive);
userRouter.patch( '/:id/approve',       restrictTo(ROLES.SUPER_ADMIN), userCtrl.approve);
userRouter.patch( '/:id/reject',        restrictTo(ROLES.SUPER_ADMIN), userCtrl.reject);
userRouter.delete('/:id',               restrictTo(ROLES.SUPER_ADMIN), userCtrl.delete);

// ── Audit logs — SUPER_ADMIN ONLY ─────────────────────────────────────────────
const auditRouter = require('express').Router();
const AuditLog    = require('../models/AuditLog');
const catchAsync  = require('../utils/catchAsync');
const { sendPaginated } = require('../utils/response');
auditRouter.use(protect, restrictTo(ROLES.SUPER_ADMIN));
auditRouter.get('/', catchAsync(async (req, res) => {
  const page  = Math.max(1, parseInt(req.query.page)  || 1);
  const limit = Math.min(100, parseInt(req.query.limit) || 20);
  const filter = {};
  if (req.query.publisher) filter.publisher = req.query.publisher;
  if (req.query.action)    filter.action    = req.query.action;
  const [logs, total] = await Promise.all([
    AuditLog.find(filter)
      .populate('user', 'name email role')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    AuditLog.countDocuments(filter),
  ]);
  sendPaginated(res, logs, total, page, limit);
}));

// ── Calls (tracking) ─────────────────────────────────────────────────────────
const callRouter = require('express').Router();
const callCtrl   = require('../controllers/call.controller');
callRouter.use(protect, tenantIsolation);
callRouter.get('/stats', callCtrl.getStats);
callRouter.get('/',      callCtrl.getAll);
callRouter.delete('/:id', restrictTo(ROLES.SUPER_ADMIN), callCtrl.deleteOne);

// ── Public (no auth) ───────────────────────────────────────────────────────────
const publicRouter = require('express').Router();
const { apiKeyAuth } = require('../middleware/auth');
const publicCtrl     = require('../controllers/public.controller');
publicRouter.post('/lead-ingest',                     apiKeyAuth, validate(schemas.ingestLead), publicCtrl.ingestLead);
publicRouter.get( '/enrich/:publisherId/:campaignId', publicCtrl.enrichEndpoint);
publicRouter.post('/enrich/:publisherId/:campaignId', publicCtrl.enrichEndpoint);
// Call-tracking pixel — accepts both GET (pixel/macro) and POST
publicRouter.get( '/call', callCtrl.ingestCall);
publicRouter.post('/call', callCtrl.ingestCall);

// ── Mount all routers ──────────────────────────────────────────────────────────
router.use('/auth',        authRouter);
router.use('/publishers',  publisherRouter);
router.use('/campaigns',   campaignRouter);
router.use('/fields',      fieldRouter);
router.use('/submissions', submissionRouter);
router.use('/calls',       callRouter);
router.use('/users',       userRouter);
router.use('/audit',       auditRouter);
router.use('/public',      publicRouter);

module.exports = router;