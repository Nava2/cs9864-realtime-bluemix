'use strict';

$(function () {
  // ID for the client
  let ID;

  $.post('/api/new', function (body) {
    console.log(body);

    if (body.success) {
      ID = body.id;
    } else {
      console.log("WE DONE GOOFED.");
    }


  });
  
  let tickers = [];

  let fetchTimeout;

  $('#add-ticker').click(function () {
    let ticker = $('#ticker-box').val().toUpperCase();

    let idx = _.sortedIndexOf(tickers, ticker);
    if (idx === -1) {

      $("#ticker-form").removeClass("has-error");

      tickers.push(ticker);
      tickers = tickers.sort();

      let $elem = $('<li>');
      $elem.text(ticker);

      $('#stock-list').append($elem);

      if (!!fetchTimeout) {
        // have a timeout set clear it
        clearTimeout(fetchTimeout);
      }

      fetch_new_data();

    } else {

      $("#ticker-form").addClass("has-error");
    }
  });

  function fetch_new_data() {
    $.get('/api/fetch',
      {id: ID, tickers: tickers},
      function (json) {

        console.log(json);

        // let $tbl = $('#data-table').find('tbody');
        //
        // if (data.stocks.length > 0) {
        //   console.log("%O", data);
        //
        //   data.stocks.map(create_row).forEach(function ($r) {
        //     $tbl.prepend($r);
        //   });
        // }

        fetchTimeout = setTimeout(fetch_new_data, 60000);
      });
  }

  
});
