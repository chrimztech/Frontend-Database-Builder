# Illustrator Workflow

This folder gives you a native Illustrator editing path for certificate artwork.

## Files

- `apply-certificate-payload.jsx`
  Run this script inside Adobe Illustrator to update named text frames and relink named placed images in the open `.ai` document.
- `illustrator-payload.example.json`
  Example data file showing the object names and value structure the script expects.

## How to use it

1. In Illustrator, open the certificate `.ai` file you want to edit.
2. Rename the page items you want the script to control.
3. In the web app, go to `Admin -> Branding` and download the Illustrator payload JSON.
4. Edit the downloaded JSON if needed:
   - Replace placeholder values like `{{recipient_name}}`
   - Add absolute local file paths for any placed images you want relinked
5. In Illustrator, run `File -> Scripts -> Other Script...` and choose `apply-certificate-payload.jsx`.
6. Pick the payload JSON when prompted.
7. Review the updated document and save it in Illustrator.

## Expected text frame names

- `org_name`
- `certificate_title`
- `certificate_subtitle`
- `recipient_name`
- `programme_name`
- `issue_date`
- `signatory1_name`
- `signatory1_title`
- `signatory2_name`
- `signatory2_title`
- `certificate_id`
- `nrc_number`
- `footer_text`

## Expected placed item names

- `logo_asset`
- `seal_asset`
- `signature1_asset`
- `signature2_asset`

## Notes

- The script updates all matching items with the same name.
- Image relinking needs local file paths because Illustrator resolves linked files on the machine where the script runs.
- If your `.ai` file contains native Illustrator objects, this workflow preserves Illustrator editability because the edits happen inside Illustrator itself.
