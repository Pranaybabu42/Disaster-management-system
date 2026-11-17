const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000').replace(/\/$/, '')

let refreshPromise

async function request(path, { token, ...options } = {}) {
  let response
  try {
    response = await fetch(`${API_BASE_URL}/api/v1/auth${path}`, {
      ...options,
      credentials: 'include',
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    })
  } catch {
    throw new Error('Could not reach the authentication service. Check that the API is running.')
  }

  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(data.message || 'The request could not be completed.')
    error.code = data.code
    error.exceptionName = data.exception_name
    error.status = data.status || 'error'
    error.statusCode = data.status_code || response.status
    error.details = data.details
    throw error
  }
  return data
}

export const authApi = {
  login: (email, password, accountType) => request('/login', {
    method: 'POST',
    body: JSON.stringify({ email, password, ...(accountType ? { account_type: accountType } : {}) }),
  }),
  register: (fullName, email, password) => request('/register', {
    method: 'POST',
    body: JSON.stringify({ full_name: fullName, email, password }),
  }),
  forgotPassword: (email) => request('/forgot-password', { method: 'POST', body: JSON.stringify({ email }) }),
  resetPassword: (token, newPassword) => request('/reset-password', {
    method: 'POST',
    body: JSON.stringify({ token, new_password: newPassword }),
  }),
  refresh: () => {
    if (!refreshPromise) {
      refreshPromise = request('/refresh', { method: 'POST' }).finally(() => { refreshPromise = undefined })
    }
    return refreshPromise
  },
  logout: (token) => request('/logout', { method: 'POST', token }),
}
