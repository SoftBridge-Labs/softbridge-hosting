# GitHub Integration

The Hosting server **DOES NOT** talk directly to GitHub. It uses the existing API:
`https://api.softbridgelabs.in/`

Endpoints used:
- `GET /github/contents`
- `GET /github/sync`
- `POST /github/file`
- `POST /github/files`
- `DELETE /github/file`
