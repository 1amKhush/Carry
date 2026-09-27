type IconName = 'arrow' | 'plus' | 'inbox' | 'link' | 'close' | 'check' | 'external' | 'note'

const paths: Record<IconName, string> = {
  arrow: 'M4 12h15m-6-6 6 6-6 6',
  plus: 'M12 5v14M5 12h14',
  inbox: 'M4 4h16l2 11v5H2v-5L4 4Zm-2 11h6l2 3h4l2-3h6',
  link: 'm10 13 4-4m-5 7-2 2a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m2 0 2-2a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0',
  close: 'm6 6 12 12M6 18 18 6',
  check: 'm5 12 4 4L19 6',
  external: 'M14 3h7v7m0-7L10 14M10 3H3v18h18v-7',
  note: 'M5 3h14v18H5V3Zm4 5h6m-6 4h6m-6 4h3',
}

export function Icon({ name }: { name: IconName }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>
}
