import { useState } from 'react'
import type { InputHTMLAttributes } from 'react'

type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>

export default function PasswordInput(props: PasswordInputProps) {
  const [visible, setVisible] = useState(false)

  return (
    <div className="password-field">
      <input {...props} type={visible ? 'text' : 'password'} />
      <button
        className="password-visibility-toggle"
        type="button"
        aria-label={visible ? 'Hide password' : 'Show password'}
        title={visible ? 'Hide password' : 'Show password'}
        onClick={() => setVisible((current) => !current)}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
          <circle cx="12" cy="12" r="3" />
          {!visible && <path d="m4 4 16 16" />}
        </svg>
      </button>
    </div>
  )
}
