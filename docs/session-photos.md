# Session photos

1. Open a session and join it.
2. Tap **Check location to share** and allow foreground, precise location.
3. Within 500 metres of the session pin (or its venue), tap **Take a photo** and allow camera access. Alternatively, choose a photo or a clip up to 30 seconds long.
4. Review the preview and optionally add a caption. Discard to choose another photo.
5. Tap **Post to session feed**. A fresh location check runs before uploading. Successful posts open the public feed. A failed attempt keeps the preview and caption for retry.

Location readings must be no more than two minutes old, with reported accuracy of 100 metres or better. Permission denial, poor GPS accuracy, and being outside the area block posting without blocking chat or browsing. Camera access expires two minutes after the initial location check. Posting always checks again. This applies to session media, including sessions at reviewed venues; it does not change venue-submission photos.

The database computes distance with PostGIS, requires session membership and a non-cancelled session, and prevents direct client inserts from bypassing the RPC. Upload permissions expire 15 minutes after post creation. Coordinates are not retained in the post; only the verification timestamp is stored. This validates device-reported location, not cryptographic proof of physical presence. Existing posts remain readable.

## Phone verification before release

- Near a session: join, grant location/camera, capture, preview, caption, post, and open the resulting feed photo.
- Outside 500 metres: confirm the nearby requirement appears and no post is created.
- Deny location or camera, then enable it in settings and retry.
- Cancel the camera, discard a draft, retry after a failed upload, and double-tap Post; confirm no duplicate uploads.
- Walk away or wait with the preview open; Post must acquire and validate a new reading.
- Test on physical iOS and Android devices. Rebuild native binaries after the camera permission configuration change.
- On web, the browser controls whether capture opens a camera or file chooser. Use the explicit camera button after the location check. Test camera cancellation in supported mobile browsers.

Automated coverage: `node scripts/tests/session-social.mjs --project-ref=YOUR_TEST_PROJECT_REF` creates and removes temporary hosted fixtures, exercising nearby publishing, both meeting-point types, invalid readings, authorization, feed retrieval, and failed-upload compensation. It requires management access and matching `.env` configuration. No Docker is needed.
