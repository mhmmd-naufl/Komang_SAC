import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { authApi, TOKEN_KEY } from '../services/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  const fetchUser = useCallback(async () => {
    const token = localStorage.getItem(TOKEN_KEY)
    if (!token) {
      setLoading(false)
      return
    }
    try {
      const { data } = await authApi.me()
      setUser(data)
    } catch {
      localStorage.removeItem(TOKEN_KEY)
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchUser()
  }, [fetchUser])

  const login = async (phone, password) => {
    const { data } = await authApi.login(phone, password)
    localStorage.setItem(TOKEN_KEY, data.token)
    setUser(data.user)
    return data.user
  }

  const register = async (payload) => {
    const { data } = await authApi.register(payload)
    localStorage.setItem(TOKEN_KEY, data.token)
    setUser(data.user)
    return data.user
  }

  const logout = () => {
    localStorage.removeItem(TOKEN_KEY)
    setUser(null)
  }

  const value = {
    user,
    loading,
    login,
    register,
    logout,
    isAuthenticated: !!user,
    isAdmin: user?.role === 'admin',
    isTechnician: user?.role === 'technician',
    isDropPoint: user?.role === 'drop_point',
    isCustomer: user?.role === 'customer',
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth harus dipakai di dalam AuthProvider')
  return ctx
}
