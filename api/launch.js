// api/launch.js  (Apps Script flow)
const lti = require('ims-lti');
const fetch = require('node-fetch'); // if not in package.json, you can use global fetch in newer Node — add dependency otherwise

module.exports = async (req, res) => {
  try {
    const consumerKey = process.env.CANVAS_CONSUMER_KEY;
    const consumerSecret = process.env.CANVAS_SHARED_SECRET;
    if (!consumerKey || !consumerSecret) return res.status(500).send('Server not configured');

    const provider = new lti.Provider(consumerKey, consumerSecret);

    provider.valid_request(req, async (err, isValid) => {
      if (err || !isValid) {
        console.error('LTI validation failed', err);
        return res.status(401).send('Invalid LTI request');
      }

      // Read launch params
      const studentEmail = req.body.lis_person_contact_email_primary || req.body.user_email || '';
      const customDoc = req.body.custom_doc_url || req.body.custom_doc || '';
      const appsScriptUrlParam = req.body.custom_appscript_url || req.body.custom_appscript || '';
      const teacherEmail = req.body.custom_teacher_email || '';

      if (!customDoc) {
        return res.status(400).send('Assignment missing custom_doc_url parameter');
      }

      // Determine apps script URL: custom param > env var
      const appsScriptUrl = appsScriptUrlParam || process.env.APPS_SCRIPT_URL;
      if (!appsScriptUrl) {
        return res.status(400).send('No Apps Script URL configured (custom_appscript_url param or APPS_SCRIPT_URL env var).');
      }

      // Call Apps Script Web App to make the copy
      try {
        const body = {
          templateDocUrl: customDoc,
          studentEmail,
          assignmentName: req.body.resource_link_title || req.body.context_title || ''
        };

        const response = await fetch(appsScriptUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });

        const jr = await response.json();
        if (!jr || !jr.success) {
          console.error('Apps Script error', jr);
          return res.status(500).send('Failed to create student copy: ' + (jr && jr.error ? jr.error : 'unknown'));
        }

        const newFileId = jr.fileId;
        // Redirect student to interstitial with fileId
        const host = process.env.HOSTNAME || `https://${req.headers.host}`;
        const interstitial = `${host}/interstitial.html?fileId=${newFileId}&studentEmail=${encodeURIComponent(studentEmail||'')}&teacherEmail=${encodeURIComponent(teacherEmail||'')}`;
        return res.redirect(interstitial);

      } catch (callErr) {
        console.error('Error calling Apps Script', callErr);
        return res.status(500).send('Server error while calling Apps Script');
      }
    });
  } catch (e) {
    console.error(e);
    res.status(500).send('Server error');
  }
};
