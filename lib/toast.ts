// Simple toast notification system
export interface Toast {
  id: string
  message: string
  type: 'success' | 'error' | 'info'
}

let toasts: Toast[] = []
let listeners: Array<() => void> = []

export const toast = {
  success: (message: string) => {
    const id = Math.random().toString(36).substr(2, 9)
    toasts.push({ id, message, type: 'success' })
    notifyListeners()
    setTimeout(() => removeToast(id), 3000)
  },
  error: (message: string) => {
    const id = Math.random().toString(36).substr(2, 9)
    toasts.push({ id, message, type: 'error' })
    notifyListeners()
    setTimeout(() => removeToast(id), 5000)
  },
  info: (message: string) => {
    const id = Math.random().toString(36).substr(2, 9)
    toasts.push({ id, message, type: 'info' })
    notifyListeners()
    setTimeout(() => removeToast(id), 3000)
  }
}

export const removeToast = (id: string) => {
  toasts = toasts.filter(toast => toast.id !== id)
  notifyListeners()
}

export const getToasts = () => toasts

export const subscribe = (listener: () => void) => {
  listeners.push(listener)
  return () => {
    listeners = listeners.filter(l => l !== listener)
  }
}

const notifyListeners = () => {
  listeners.forEach(listener => listener())
}
