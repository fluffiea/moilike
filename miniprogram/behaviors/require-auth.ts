import { redirectIfNotAuthed } from '../utils/auth-guard'

export default Behavior({
  pageLifetimes: {
    show() {
      redirectIfNotAuthed()
    },
  },
})
