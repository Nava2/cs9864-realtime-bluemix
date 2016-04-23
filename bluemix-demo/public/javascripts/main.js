'use strict';

$(function () {
  // on ready
  
  let ID = null;

  let create_row = (function () {
    let row_idx = 1;
    return function create_row(d) {
      let row = $('<tr>');
      row.append($('<td>').text("" + d.id));
      row.append($('<td>').text(d.ticker));
      row.append($('<td>').text(d.when.date));
      row.append($('<td>').text(d.when.time));
      row.append($('<td>').text(d.price/100));
      row.append($('<td>').text(d.size));

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
    let ticker = $('#ticker-box').val();

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
  });
});
