/**
 * Created by kevin on 22/03/16.
 */

module.exports = {
  EXCHANGES: [
    {
      id: 'A',
      name: 'NYSE MKT Stock Exchange'
    }, {
      id: 'B',
      name: 'NYSE MKT Stock Exchange'
    }, {
      id: 'C',
      name: 'National Stock Exchange'
    }, {
      id: 'D',
      name: 'FINRA'
    }, {
      id: 'I',
      name: 'International Securities Exchange'
    }, {
      id: 'J',
      name: 'Direct Edge A Stock Exchange'
    }, {
      id: 'K',
      name: 'Direct Edge X Stock Exchange'
    }, {
      id: 'M',
      name: 'Chicago Stock Exchange'
    }, {
      id: 'N',
      name: 'New York Stock Exchange'
    }, {
      id: 'P',
      name: 'NYSE Arca SM'
    }, {
      id: 'S',
      name: 'Consolidated Tape System'
    }, {
      id: 'Q',
      name: 'NASDAQ Stock Exchange'
    }, {
      id: 'T',
      name: 'NASDAQ Stock Exchange'
    }, {
      id: 'W',
      name: 'CBOE Stock Exchange'
    }, {
      id: 'X',
      name: 'NASDAQ OMX PSX Stock Exchange'
    }, {
      id: 'Y',
      name: 'BATS Y-Exchange'
    }, {
      id: 'Z',
      name: 'BATS Exchange'
    }
  ],
  CONDITIONS: [
    {
      exch: ['A', 'N'],
      code: 'L',
      long: 'Sold Last (late reporting)'
    },
    {
      exch: ['A', 'N'],
      code: 'N',
      long: 'Next Day Trade (next day clearing)'
    },
    {
      exch: ['A', 'N'],
      code: 'O',
      long: 'Market Center Opening Trade'
    },
    {
      exch: ['A', 'N'],
      code: 'R',
      long: 'Seller'
    },
    {
      exch: ['A', 'N'],
      code: 'T',
      long: 'Extended Hours Trade'
    },
    {
      exch: ['A', 'N'],
      code: 'U',
      long: 'Extended Hours (Sold Out of Sequence) '
    },
    {
      exch: ['A', 'N'],
      code: 'Z',
      long: 'Sold (out of sequence)'
    },
    {
      exch: ['A', 'N'],
      code: '4',
      long: 'Derivatively Priced'
    },
    {
      exch: ['A', 'N'],
      code: '5',
      long: 'Market Center Re-opening Prints'
    },
    {
      exch: ['A', 'N'],
      code: '6',
      long: 'Market Center Closing Prints'
    },


    {
      exch: ['B', 'T', 'Q', 'X'],
      code: 'A',
      long: 'Acquisition'
    },
    {
      exch: ['B', 'T', 'Q', 'X'],
      code: 'B',
      long: 'Bunched Trade'
    },
    {
      exch: ['B', 'T', 'Q', 'X'],
      code: 'C',
      long: 'Cash Trade'
    },
    {
      exch: ['B', 'T', 'Q', 'X'],
      code: 'D',
      long: 'Distribution'
    },
    {
      exch: ['B', 'T', 'Q', 'X'],
      code: 'F',
      long: 'Intermarket Sweep'
    },
    {
      exch: ['B', 'T', 'Q', 'X'],
      code: 'G',
      long: 'Bunched Sold Trade'
    },
    {
      exch: ['B', 'T', 'Q', 'X'],
      code: 'K',
      long: 'Rule 155 Trade (NYSE MKT Only)'
    },
    {
      exch: ['B', 'T', 'Q', 'X'],
      code: 'L',
      long: 'Sold Last'
    },
    {
      exch: ['B', 'T', 'Q', 'X'],
      code: 'M',
      long: 'Market Center Close Price'
    },
    {
      exch: ['B', 'T', 'Q', 'X'],
      code: 'N',
      long: 'Next Day'
    },
    {
      exch: ['B', 'T', 'Q', 'X'],
      code: 'O',
      long: 'Opening Prints'
    },
    {
      exch: ['B', 'T', 'Q', 'X'],
      code: 'P',
      long: 'Prior Reference Price'
    },
    {
      exch: ['B', 'T', 'Q', 'X'],
      code: 'Q',
      long: 'Market Center Open Price'
    },
    {
      exch: ['B', 'T', 'Q', 'X'],
      code: 'R',
      long: 'Seller (Long-Form Message Formats Only)'
    },
    {
      exch: ['B', 'T', 'Q', 'X'],
      code: 'S',
      long: 'Split Trade'
    },
    {
      exch: ['B', 'T', 'Q', 'X'],
      code: 'T',
      long: 'Form - T Trade'
    },
    {
      exch: ['B', 'T', 'Q', 'X'],
      code: 'U',
      long: 'Extended Hours (Sold Out of Sequence)'
    },
    {
      exch: ['B', 'T', 'Q', 'X'],
      code: 'W',
      long: 'Average Price Trade'
    },
    {
      exch: ['B', 'T', 'Q', 'X'],
      code: 'Y',
      long: 'Yellow Flag'
    },
    {
      exch: ['B', 'T', 'Q', 'X'],
      code: 'Z',
      long: 'Sold (Out of Sequence)'
    },
    {
      exch: ['B', 'T', 'Q', 'X'],
      code: '1',
      long: 'Stopped Stock - Regular Trade'
    },
    {
      exch: ['B', 'T', 'Q', 'X'],
      code: '2',
      long: 'Stopped Stock - Sold Last'
    },
    {
      exch: ['B', 'T', 'Q', 'X'],
      code: '3',
      long: 'Stopped Stock - Sold Last 3 = Stopped Stock - Sold'
    },
    {
      exch: ['B', 'T', 'Q', 'X'],
      code: '4',
      long: 'Derivatively Priced'
    },
    {
      exch: ['B', 'T', 'Q', 'X'],
      code: '5',
      long: 'Re-opening Prints'
    },
    {
      exch: ['B', 'T', 'Q', 'X'],
      code: '6',
      long: 'Closing Prints'
    },
    {
      exch: ['B', 'T', 'Q', 'X'],
      code: '7',
      long: 'Placeholder for 611 Exempt'
    },
    {
      exch: ['B', 'T', 'Q', 'X'],
      code: '8',
      long: 'Placeholder for 611 Exempt'
    },
    {
      exch: ['B', 'T', 'Q', 'X'],
      code: '9',
      long: 'Placeholder for 611 Exempt'
    },

    {
      exch: ['*'],
      code: '@',
      long: 'Regular Sale (no condition)'
    },
    {
      exch: ['*'],
      code: 'B',
      long: 'Average Price Trade'
    },
    {
      exch: ['*'],
      code: 'C',
      long: 'Cash Trade (same day clearing) '
    },
    {
      exch: ['*'],
      code: 'E',
      long: 'Automatic Execution'
    },
    {
      exch: ['*'],
      code: 'F',
      long: 'Intermarket Sweep Order'
    },
    {
      exch: ['*'],
      code: 'G',
      long: 'Opening/Reopening Trade Detail'
    },
    {
      exch: ['*'],
      code: 'H',
      long: 'Intraday Trade Detail'
    },
    {
      exch: ['*'],
      code: 'I',
      long: 'CAP Election Trade'
    },
    {
      exch: ['*'],
      code: 'K',
      long: 'Rule 127 trade (NYSE only) or Rule 155 trade'
    }

  ]
};