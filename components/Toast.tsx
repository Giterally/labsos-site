"use client"

import { useEffect, useState } from "react"
import { getToasts, subscribe, removeToast, Toast as ToastType } from "@/lib/toast"
import { XMarkIcon, CheckCircleIcon, ExclamationTriangleIcon, InformationCircleIcon } from "@heroicons/react/24/outline"

export default function Toast() {
  const [toasts, setToasts] = useState<ToastType[]>([])

  useEffect(() => {
    const unsubscribe = subscribe(() => {
      setToasts(getToasts())
    })
    return unsubscribe
  }, [])

  if (toasts.length === 0) return null

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`
            flex items-center space-x-3 p-4 rounded-lg shadow-lg border
            ${toast.type === 'success' ? 'bg-green-50 border-green-200 text-green-800' : ''}
            ${toast.type === 'error' ? 'bg-red-50 border-red-200 text-red-800' : ''}
            ${toast.type === 'info' ? 'bg-blue-50 border-blue-200 text-blue-800' : ''}
          `}
        >
          {toast.type === 'success' && <CheckCircleIcon className="h-5 w-5 text-green-600" />}
          {toast.type === 'error' && <ExclamationTriangleIcon className="h-5 w-5 text-red-600" />}
          {toast.type === 'info' && <InformationCircleIcon className="h-5 w-5 text-blue-600" />}
          <span className="flex-1 text-sm font-medium">{toast.message}</span>
          <button
            onClick={() => removeToast(toast.id)}
            className="text-gray-400 hover:text-gray-600"
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  )
}
