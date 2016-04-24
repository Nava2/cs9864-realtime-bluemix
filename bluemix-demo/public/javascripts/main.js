'use strict';

$(function () {
  // on ready
  
  let ID = null;

  let tickers = [];

  let create_row = (function () {
    let row_idx = 1;
    return function create_row(d) {
      let row = $('<tr>');
      let idx_str = row_idx.toString();
      row.append($('<td>').text("      ".substring(0, 5 - idx_str.length) + idx_str));
      row.append($('<td>').text(d.id.toString(16)));
      row.append($('<td>').text(d.ticker));
      row.append($('<td>').text(d.when.date));
      row.append($('<td>').text(d.when.time));
      row.append($('<td>').text(d.price/100));
      row.append($('<td>').text(d.size));

      row_idx += 1;
      return row;
    };
  })();

  function fetch_new_data() {
    $.get('/api/fetch',
      {id: ID},
      function (data) {

        let $tbl = $('#data-table').find('tbody');

        if (data.stocks.length > 0) {
          console.log("%O", data);

          data.stocks.map(create_row).forEach(function ($r) {
            $tbl.prepend($r);
          });
        }

        setTimeout(fetch_new_data, 1000);
      });
  }

  $.post('/api/client', function (data) {
    // data will be 
    // { success: true, id: ID }
    console.log(data);

    ID = data.id;

    setTimeout(fetch_new_data, 1000);
  });
  
  $('#add-ticker').click(function () {
    let ticker = $('#ticker-box').val().toUpperCase();

    let idx = _.sortedIndexOf(tickers, ticker);
    if (idx === -1) {

      $("#ticker-form").removeClass("has-error");

      tickers.push(ticker);
      tickers = tickers.sort();

      let body = {
        id: ID,
        tickers: [ticker]
      };

      $.post({
        url: '/api/tickers',
        data: JSON.stringify(body),
        dataType: 'json',
        success: function () {
          let $elem = $('<li>');
          $elem.text(ticker);

          $('#stock-list').append($elem);
        },

        contentType: "application/json"
      });
    } else {

        $("#ticker-form").addClass("has-error");
    }



  });
});
