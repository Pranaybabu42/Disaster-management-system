 

# Disaster Management System API

## Local authentication setup

The API connects to MongoDB at `mongodb://localhost:27017/DMS` by default and uses the `DMS` database. Authentication data is stored in `users`, `auth_sessions`, `auth_rate_limits`, and `auth_audit_events` collections.

1. Use Python 3.11 or newer and start a local MongoDB instance.
2. Create a virtual environment and install the dependencies:

   ```powershell
   py -m venv .venv
   .\.venv\Scripts\Activate.ps1
   pip install -r requirements.txt
   ```

3. Copy `.env.example` to `.env` and replace `JWT_SIGNING_KEY` with a cryptographically random secret of at least 32 characters. Keep `.env` out of source control. Set `REFRESH_COOKIE_SECURE=true` outside local HTTP development and set `CORS_ORIGINS` to the exact frontend origin(s).
4. Start the API from the `Backend` directory:

   ```powershell
   python run.py
   ```

   You can also start it from the project root with `Backend\.venv\Scripts\python.exe Backend\run.py`. The runner uses `HOST`, `PORT`, `RELOAD`, and `LOG_LEVEL` environment variables when supplied; local defaults are `127.0.0.1:8000` with reload enabled.

The OpenAPI interface is available at `http://localhost:8000/docs`.

## Backend structure

This backend uses a modular service/repository structure. It is a JSON API, so it has no server-rendered MVC views.

- `app/api/v1/endpoints/` contains HTTP handlers. Handlers validate/receive schemas, call a service, and shape HTTP responses; they do not query MongoDB.
- `app/api/v1/dependencies/` provides shared request dependencies such as the auth service and authorization guards.
- `app/modules/<feature>/service.py` contains feature workflows and business rules.
- `app/modules/<feature>/repository.py` owns MongoDB queries and persistence for that feature.
- `app/modules/<feature>/schemas.py` defines API input/output data; `security.py` contains password/JWT primitives.
- `app/core/` owns app configuration, Mongo client setup, and index initialization.

For new disaster-response or AI features, add a feature module with its own service and repository, then expose it through a thin versioned endpoint. Keep model-provider calls behind service interfaces, and send long-running document ingestion or inference jobs to workers rather than blocking request handlers.

## Error response format

All handled API errors use one envelope. `status` is the HTTP status; `error.code` is a stable application code; `error.exception_name` identifies the handled exception; and `error.message` is safe to display. `error.details` is included for validation failures and omits submitted values such as passwords.

```json
{
  "success": false,
  "status_code": 401,
  "status": "error",
  "code": "AUTH_INVALID_CREDENTIALS",
  "exception_name": "InvalidCredentials",
  "message": "Invalid email or password"
}
```

## Authentication routes

- `POST /api/v1/auth/register` creates a user with an Argon2id password hash. The response is generic to avoid exposing whether an email already exists.
- `POST /api/v1/auth/login` accepts `email` and `password`, returns a short-lived bearer access token, and sets a rotating refresh token in an HttpOnly cookie.
- `POST /api/v1/auth/refresh` atomically rotates the refresh token. Reuse of an older token revokes the user's sessions.
- `POST /api/v1/auth/logout` and `POST /api/v1/auth/logout-all` revoke sessions.
- `GET /api/v1/auth/me`, `GET /api/v1/auth/sessions`, and `DELETE /api/v1/auth/sessions/{id}` require a bearer access token.
- `POST /api/v1/auth/forgot-password` returns the same response for known and unknown addresses. Configure SMTP values in `.env` to send recovery email.
- `POST /api/v1/auth/reset-password` consumes a one-time reset token, updates the Argon2id hash, and revokes existing sessions.

Access tokens stay in frontend memory. Refresh tokens are stored as SHA-256 digests in MongoDB; the raw token is only sent as an HttpOnly cookie. Argon2id cost settings are configured with `PASSWORD_HASH_*` variables. Argon2 generates a cryptographically random salt per password and stores it in the encoded password hash; a shared salt must not be configured.

JWTs use HS256 with a `kid` header. For rollover, set a new `JWT_SIGNING_KEY` and `JWT_SIGNING_KEY_ID`, then retain the previous key as `kid=secret` in `JWT_PREVIOUS_SIGNING_KEYS` until all tokens signed with it have expired. HS256 keys are shared secrets and cannot be published as public verification keys; public-key/JWKS distribution requires an asymmetric signing setup such as RS256/EdDSA.
