import { redirectIfNotAuthed } from '../../utils/auth-guard'

Component({
  pageLifetimes: {
    show() {
      redirectIfNotAuthed()
    },
  },
  data: {},
  methods: {},
})
