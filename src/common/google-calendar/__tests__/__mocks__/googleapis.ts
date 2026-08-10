const mockCalendarClient = {
  events: {
    insert: jest.fn(),
    delete: jest.fn(),
    patch: jest.fn(),
  },
};

export const google = {
  calendar: jest.fn().mockReturnValue(mockCalendarClient),
  auth: {
    JWT: jest.fn(),
  },
};
