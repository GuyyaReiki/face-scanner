import axios from 'axios'

const api = axios.create({ baseURL: '/' })

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('authToken')
  if (token) {
    config.headers['Authorization'] = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('authToken')
      localStorage.removeItem('userRole')
      localStorage.removeItem('userId')
      localStorage.removeItem('username')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

export const login = (username, password) =>
  api.post('/api/auth/login', { username, password })

export const setupAdmin = (username, password) =>
  api.post('/api/auth/setup', { username, password })

export const getMe = () => api.get('/api/auth/me')

export const getUsers = () => api.get('/api/users')

export const createUser = (formData) =>
  api.post('/api/users', formData, { headers: { 'Content-Type': 'multipart/form-data' } })

export const deleteUser = (id) => api.delete(`/api/users/${id}`)

export const checkIn = (formData) =>
  api.post('/api/attendance/check', formData, { headers: { 'Content-Type': 'multipart/form-data' } })

export const getAttendance = (params) => api.get('/api/attendance', { params })

export const getUserAttendance = (userId, params) =>
  api.get(`/api/attendance/${userId}`, { params })
