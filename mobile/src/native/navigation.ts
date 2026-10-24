export const isTestPath = (path: string) => /^\/test\/[^/]+\/?$/.test(path);

export const shouldConfirmTestExit = (from: string, to: string) =>
  isTestPath(from) && from !== to && !/^\/results\/[^/]+\/?$/.test(to);

export const confirmTestExit = () => window.confirm(
  "You are currently taking an active exam. Are you sure you want to leave? Your exam will not be submitted."
);